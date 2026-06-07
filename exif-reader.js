/**
 * EXIF Reader — Lightweight EXIF/metadata parser for JPEG and PNG files.
 * Reads camera info, software, GPS coordinates, and other metadata from raw image bytes.
 */

const ExifReader = (() => {
    /**
     * Parse EXIF data from an ArrayBuffer.
     * Returns an object with extracted metadata fields.
     */
    function parse(arrayBuffer) {
        const result = {
            camera: null,
            cameraModel: null,
            lens: null,
            software: null,
            dateTime: null,
            gps: null,
            gpsLatitude: null,
            gpsLongitude: null,
            gpsAltitude: null,
            gpsDirection: null,
            exposureTime: null,
            fNumber: null,
            iso: null,
            focalLength: null,
            colorSpace: null,
            hasExif: false,
            hasThumbnail: false,
            rawTags: {}
        };

        const view = new DataView(arrayBuffer);
        const length = view.byteLength;

        if (length < 4) return result;

        // Check for JPEG
        if (view.getUint8(0) === 0xFF && view.getUint8(1) === 0xD8) {
            return parseJPEG(view, length, result);
        }

        // Check for PNG
        if (view.getUint8(0) === 0x89 && view.getUint8(1) === 0x50 &&
            view.getUint8(2) === 0x4E && view.getUint8(3) === 0x47) {
            return parsePNG(view, length, result);
        }

        // WebP — limited metadata
        if (view.getUint8(0) === 0x52 && view.getUint8(1) === 0x49 &&
            view.getUint8(2) === 0x46 && view.getUint8(3) === 0x46) {
            return parseWebP(view, length, result);
        }

        return result;
    }

    function parseJPEG(view, length, result) {
        let offset = 2;

        while (offset < length - 1) {
            if (view.getUint8(offset) !== 0xFF) break;

            const marker = view.getUint8(offset + 1);

            // APP1 marker (EXIF)
            if (marker === 0xE1) {
                const segmentLength = view.getUint16(offset + 2);
                const exifOffset = offset + 4;

                // Check for "Exif\0\0"
                if (getString(view, exifOffset, 4) === 'Exif') {
                    result.hasExif = true;
                    const tiffOffset = exifOffset + 6;
                    parseTIFF(view, tiffOffset, length, result);
                }

                // Check for XMP (contains AI tool info)
                const possibleXMP = getString(view, exifOffset, 28);
                if (possibleXMP.includes('http://ns.adobe.com')) {
                    const xmpData = getString(view, exifOffset, Math.min(segmentLength, 65000));
                    parseXMP(xmpData, result);
                }

                offset += 2 + segmentLength;
            }
            // APP13 (IPTC / Photoshop)
            else if (marker === 0xED) {
                const segmentLength = view.getUint16(offset + 2);
                const segData = getString(view, offset + 4, Math.min(segmentLength, 65000));
                if (segData.includes('Photoshop') || segData.includes('Adobe')) {
                    if (!result.software) result.software = 'Adobe Photoshop';
                    result.rawTags['IPTC'] = 'Photoshop IRB detected';
                }
                offset += 2 + segmentLength;
            }
            // Other APP markers
            else if (marker >= 0xE0 && marker <= 0xEF) {
                const segmentLength = view.getUint16(offset + 2);
                offset += 2 + segmentLength;
            }
            // Comment
            else if (marker === 0xFE) {
                const segmentLength = view.getUint16(offset + 2);
                const comment = getString(view, offset + 4, segmentLength - 2);
                result.rawTags['Comment'] = comment;
                checkSoftwareInString(comment, result);
                offset += 2 + segmentLength;
            }
            // SOS (Start of Scan) — stop
            else if (marker === 0xDA) {
                break;
            }
            else {
                if (offset + 3 < length) {
                    const segmentLength = view.getUint16(offset + 2);
                    offset += 2 + segmentLength;
                } else {
                    break;
                }
            }
        }

        return result;
    }

    function parseTIFF(view, tiffOffset, length, result) {
        if (tiffOffset + 8 > length) return;

        const bigEndian = view.getUint16(tiffOffset) === 0x4D4D;
        const getU16 = (o) => view.getUint16(o, !bigEndian);
        const getU32 = (o) => view.getUint32(o, !bigEndian);

        const ifdOffset = getU32(tiffOffset + 4);
        readIFD(view, tiffOffset, tiffOffset + ifdOffset, length, getU16, getU32, result, bigEndian);
    }

    function readIFD(view, tiffBase, ifdOffset, length, getU16, getU32, result, bigEndian) {
        if (ifdOffset + 2 > length) return;

        const numEntries = getU16(ifdOffset);
        let exifIFDOffset = null;
        let gpsIFDOffset = null;

        for (let i = 0; i < numEntries; i++) {
            const entryOffset = ifdOffset + 2 + i * 12;
            if (entryOffset + 12 > length) break;

            const tag = getU16(entryOffset);
            const type = getU16(entryOffset + 2);
            const count = getU32(entryOffset + 4);
            const valueOffset = entryOffset + 8;

            let value = null;

            // ASCII string
            if (type === 2) {
                const strLen = count - 1;
                if (strLen > 4) {
                    const ptr = getU32(valueOffset) + tiffBase;
                    if (ptr + strLen <= length) {
                        value = getString(view, ptr, strLen).trim();
                    }
                } else if (strLen > 0) {
                    value = getString(view, valueOffset, strLen).trim();
                }
            }
            // SHORT
            else if (type === 3 && count === 1) {
                value = getU16(valueOffset);
            }
            // LONG
            else if (type === 4 && count === 1) {
                value = getU32(valueOffset);
            }
            // RATIONAL
            else if (type === 5 && count === 1) {
                const ptr = getU32(valueOffset) + tiffBase;
                if (ptr + 8 <= length) {
                    const num = getU32(ptr);
                    const den = getU32(ptr + 4);
                    value = den !== 0 ? num / den : 0;
                }
            }

            // Map tags
            switch (tag) {
                case 0x010F: // Make
                    if (value) { result.camera = value; result.rawTags['Make'] = value; }
                    break;
                case 0x0110: // Model
                    if (value) { result.cameraModel = value; result.rawTags['Model'] = value; }
                    break;
                case 0x0131: // Software
                    if (value) { result.software = value; result.rawTags['Software'] = value; }
                    break;
                case 0x0132: // DateTime
                    if (value) { result.dateTime = value; result.rawTags['DateTime'] = value; }
                    break;
                case 0x8769: // ExifIFD pointer
                    exifIFDOffset = getU32(valueOffset) + tiffBase;
                    break;
                case 0x8825: // GPS IFD pointer
                    gpsIFDOffset = getU32(valueOffset) + tiffBase;
                    break;
                case 0xA001: // ColorSpace
                    if (value) result.colorSpace = value === 1 ? 'sRGB' : 'Uncalibrated';
                    break;
            }
        }

        // Read Exif sub-IFD
        if (exifIFDOffset && exifIFDOffset < length) {
            readExifSubIFD(view, tiffBase, exifIFDOffset, length, getU16, getU32, result, bigEndian);
        }

        // Read GPS IFD — full coordinate extraction
        if (gpsIFDOffset && gpsIFDOffset < length) {
            readGPSIFD(view, tiffBase, gpsIFDOffset, length, getU16, getU32, result);
        }
    }

    function readExifSubIFD(view, tiffBase, ifdOffset, length, getU16, getU32, result) {
        if (ifdOffset + 2 > length) return;

        const numEntries = getU16(ifdOffset);

        for (let i = 0; i < numEntries; i++) {
            const entryOffset = ifdOffset + 2 + i * 12;
            if (entryOffset + 12 > length) break;

            const tag = getU16(entryOffset);
            const type = getU16(entryOffset + 2);
            const count = getU32(entryOffset + 4);
            const valueOffset = entryOffset + 8;

            let value = null;

            if (type === 2) {
                const strLen = count - 1;
                if (strLen > 4) {
                    const ptr = getU32(valueOffset) + tiffBase;
                    if (ptr + strLen <= length) {
                        value = getString(view, ptr, strLen).trim();
                    }
                } else if (strLen > 0) {
                    value = getString(view, valueOffset, strLen).trim();
                }
            } else if (type === 3 && count === 1) {
                value = getU16(valueOffset);
            } else if (type === 5 && count === 1) {
                const ptr = getU32(valueOffset) + tiffBase;
                if (ptr + 8 <= length) {
                    const num = getU32(ptr);
                    const den = getU32(ptr + 4);
                    value = den !== 0 ? num / den : 0;
                }
            }

            switch (tag) {
                case 0x829A: // ExposureTime
                    if (value) { result.exposureTime = value; result.rawTags['ExposureTime'] = value; }
                    break;
                case 0x829D: // FNumber
                    if (value) { result.fNumber = value; result.rawTags['FNumber'] = value; }
                    break;
                case 0x8827: // ISO
                    if (value) { result.iso = value; result.rawTags['ISO'] = value; }
                    break;
                case 0x920A: // FocalLength
                    if (value) { result.focalLength = value; result.rawTags['FocalLength'] = value; }
                    break;
                case 0xA434: // LensModel
                    if (value) { result.lens = value; result.rawTags['LensModel'] = value; }
                    break;
            }
        }
    }

    /**
     * Parse GPS IFD to extract latitude, longitude, altitude, and direction.
     * GPS coordinates are stored as RATIONAL arrays (degrees, minutes, seconds).
     */
    function readGPSIFD(view, tiffBase, ifdOffset, length, getU16, getU32, result) {
        if (ifdOffset + 2 > length) return;

        const numEntries = getU16(ifdOffset);

        let latRef = null, lonRef = null;
        let latValues = null, lonValues = null;
        let altRef = 0, altValue = null;
        let dirValue = null;

        for (let i = 0; i < numEntries; i++) {
            const entryOffset = ifdOffset + 2 + i * 12;
            if (entryOffset + 12 > length) break;

            const tag = getU16(entryOffset);
            const type = getU16(entryOffset + 2);
            const count = getU32(entryOffset + 4);
            const valueOffset = entryOffset + 8;

            switch (tag) {
                case 0x0001: // GPSLatitudeRef (N/S)
                    latRef = getString(view, valueOffset, 1);
                    break;

                case 0x0002: // GPSLatitude (3 x RATIONAL: deg, min, sec)
                    if (type === 5 && count === 3) {
                        latValues = readRationalArray(view, getU32(valueOffset) + tiffBase, 3, length, getU32);
                    }
                    break;

                case 0x0003: // GPSLongitudeRef (E/W)
                    lonRef = getString(view, valueOffset, 1);
                    break;

                case 0x0004: // GPSLongitude (3 x RATIONAL: deg, min, sec)
                    if (type === 5 && count === 3) {
                        lonValues = readRationalArray(view, getU32(valueOffset) + tiffBase, 3, length, getU32);
                    }
                    break;

                case 0x0005: // GPSAltitudeRef (0 = above sea level, 1 = below)
                    if (type === 1) {
                        altRef = view.getUint8(valueOffset);
                    }
                    break;

                case 0x0006: // GPSAltitude (RATIONAL)
                    if (type === 5 && count === 1) {
                        const ptr = getU32(valueOffset) + tiffBase;
                        if (ptr + 8 <= length) {
                            const num = getU32(ptr);
                            const den = getU32(ptr + 4);
                            altValue = den !== 0 ? num / den : 0;
                        }
                    }
                    break;

                case 0x0011: // GPSImgDirection (RATIONAL)
                    if (type === 5 && count === 1) {
                        const ptr = getU32(valueOffset) + tiffBase;
                        if (ptr + 8 <= length) {
                            const num = getU32(ptr);
                            const den = getU32(ptr + 4);
                            dirValue = den !== 0 ? num / den : 0;
                        }
                    }
                    break;
            }
        }

        // Convert DMS to decimal degrees
        if (latValues && lonValues) {
            let lat = dmsToDecimal(latValues[0], latValues[1], latValues[2]);
            let lon = dmsToDecimal(lonValues[0], lonValues[1], lonValues[2]);

            if (latRef === 'S') lat = -lat;
            if (lonRef === 'W') lon = -lon;

            // Validate coordinates
            if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
                result.gps = 'Present';
                result.gpsLatitude = lat;
                result.gpsLongitude = lon;
                result.rawTags['GPS_Latitude'] = `${Math.abs(lat).toFixed(6)}° ${latRef || 'N'}`;
                result.rawTags['GPS_Longitude'] = `${Math.abs(lon).toFixed(6)}° ${lonRef || 'E'}`;
            }
        }

        if (altValue !== null) {
            result.gpsAltitude = altRef === 1 ? -altValue : altValue;
            result.rawTags['GPS_Altitude'] = `${result.gpsAltitude.toFixed(1)}m`;
        }

        if (dirValue !== null) {
            result.gpsDirection = dirValue;
            result.rawTags['GPS_Direction'] = `${dirValue.toFixed(1)}°`;
        }

        // Mark GPS as present even if we couldn't parse coords
        if (!result.gps && numEntries > 0) {
            result.gps = 'Partial';
            result.rawTags['GPS'] = 'GPS IFD found but coordinates incomplete';
        }
    }

    /**
     * Read an array of RATIONAL values from a byte offset.
     */
    function readRationalArray(view, offset, count, length, getU32) {
        const values = [];
        for (let i = 0; i < count; i++) {
            const ptr = offset + i * 8;
            if (ptr + 8 > length) break;
            const num = getU32(ptr);
            const den = getU32(ptr + 4);
            values.push(den !== 0 ? num / den : 0);
        }
        return values;
    }

    /**
     * Convert degrees/minutes/seconds to decimal degrees.
     */
    function dmsToDecimal(degrees, minutes, seconds) {
        return degrees + (minutes / 60) + (seconds / 3600);
    }

    function parsePNG(view, length, result) {
        let offset = 8; // Skip PNG signature

        while (offset + 8 < length) {
            const chunkLength = view.getUint32(offset);
            const chunkType = getString(view, offset + 4, 4);

            if (chunkType === 'tEXt' || chunkType === 'iTXt') {
                const textData = getString(view, offset + 8, Math.min(chunkLength, 10000));
                checkSoftwareInString(textData, result);

                if (textData.toLowerCase().includes('comment')) {
                    result.rawTags['PNG_Text'] = textData.substring(0, 200);
                }
                if (textData.includes('parameters') || textData.includes('prompt')) {
                    result.rawTags['AI_Params'] = 'AI generation parameters detected';
                }
            }

            if (chunkType === 'eXIf') {
                result.hasExif = true;
            }

            offset += 12 + chunkLength;

            if (chunkType === 'IEND') break;
        }

        return result;
    }

    function parseWebP(view, length, result) {
        const textSample = getString(view, 0, Math.min(length, 4096));
        checkSoftwareInString(textSample, result);
        return result;
    }

    function parseXMP(xmpString, result) {
        const aiTools = [
            'Midjourney', 'DALL-E', 'DALL·E', 'Stable Diffusion',
            'StableDiffusion', 'ComfyUI', 'Automatic1111', 'NovelAI',
            'Adobe Firefly', 'Bing Image Creator', 'Leonardo.ai',
            'Playground AI', 'Craiyon', 'Imagen', 'Flux'
        ];

        const lowerXMP = xmpString.toLowerCase();

        for (const tool of aiTools) {
            if (lowerXMP.includes(tool.toLowerCase())) {
                result.software = result.software ? `${result.software}, ${tool}` : tool;
                result.rawTags['XMP_AI_Tool'] = tool;
            }
        }

        if (lowerXMP.includes('photoshop')) {
            if (!result.software || !result.software.includes('Photoshop')) {
                result.software = result.software ? `${result.software}, Adobe Photoshop` : 'Adobe Photoshop';
            }
            result.rawTags['XMP_Photoshop'] = 'Adobe Photoshop traces found';
        }

        if (lowerXMP.includes('lightroom')) {
            result.software = result.software ? `${result.software}, Adobe Lightroom` : 'Adobe Lightroom';
            result.rawTags['XMP_Lightroom'] = 'Adobe Lightroom traces found';
        }
    }

    function checkSoftwareInString(str, result) {
        if (!str) return;
        const lower = str.toLowerCase();

        const aiKeywords = {
            'midjourney': 'Midjourney',
            'dall-e': 'DALL-E',
            'dall·e': 'DALL-E',
            'stable diffusion': 'Stable Diffusion',
            'stablediffusion': 'Stable Diffusion',
            'comfyui': 'ComfyUI',
            'automatic1111': 'Automatic1111',
            'novelai': 'NovelAI',
            'firefly': 'Adobe Firefly',
            'leonardo': 'Leonardo.ai',
            'flux': 'Flux',
            'imagen': 'Imagen',
            'craiyon': 'Craiyon'
        };

        const editorKeywords = {
            'photoshop': 'Adobe Photoshop',
            'lightroom': 'Adobe Lightroom',
            'gimp': 'GIMP',
            'canva': 'Canva',
            'figma': 'Figma',
            'affinity': 'Affinity',
            'paint.net': 'Paint.NET',
            'pixlr': 'Pixlr',
            'snapseed': 'Snapseed',
            'capture one': 'Capture One'
        };

        for (const [key, name] of Object.entries(aiKeywords)) {
            if (lower.includes(key)) {
                if (!result.software || !result.software.includes(name)) {
                    result.software = result.software ? `${result.software}, ${name}` : name;
                }
                result.rawTags['Detected_AI'] = name;
            }
        }

        for (const [key, name] of Object.entries(editorKeywords)) {
            if (lower.includes(key)) {
                if (!result.software || !result.software.includes(name)) {
                    result.software = result.software ? `${result.software}, ${name}` : name;
                }
                result.rawTags['Detected_Editor'] = name;
            }
        }
    }

    function getString(view, offset, length) {
        let str = '';
        for (let i = 0; i < length && offset + i < view.byteLength; i++) {
            const charCode = view.getUint8(offset + i);
            if (charCode === 0) continue;
            str += String.fromCharCode(charCode);
        }
        return str;
    }

    return { parse };
})();
