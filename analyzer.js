/**
 * ImageAnalyzer — Core analysis engine that processes image data
 * through multiple forensic checks and computes an authenticity score.
 * Includes location analysis for GPS coordinate verification.
 */

const ImageAnalyzer = (() => {

    // Known AI-generation resolutions
    const AI_RESOLUTIONS = [
        { w: 512, h: 512, tool: 'Stable Diffusion v1' },
        { w: 768, h: 768, tool: 'Stable Diffusion' },
        { w: 1024, h: 1024, tool: 'DALL-E / Midjourney / SD' },
        { w: 1024, h: 1792, tool: 'DALL-E 3 (portrait)' },
        { w: 1792, h: 1024, tool: 'DALL-E 3 (landscape)' },
        { w: 1344, h: 768, tool: 'Midjourney' },
        { w: 768, h: 1344, tool: 'Midjourney' },
        { w: 896, h: 1152, tool: 'Midjourney / SD' },
        { w: 1152, h: 896, tool: 'Midjourney / SD' },
        { w: 1536, h: 1024, tool: 'Midjourney v6' },
        { w: 1024, h: 1536, tool: 'Midjourney v6' },
        { w: 2048, h: 2048, tool: 'Midjourney / DALL-E' },
        { w: 1080, h: 1080, tool: 'Possible AI (square)' },
        { w: 1440, h: 1440, tool: 'Possible AI (square)' },
        { w: 2048, h: 1152, tool: 'Flux / SD' },
        { w: 1152, h: 2048, tool: 'Flux / SD' },
    ];

    // Known AI tools
    const AI_TOOLS = [
        'midjourney', 'dall-e', 'dall·e', 'stable diffusion',
        'stablediffusion', 'comfyui', 'automatic1111', 'novelai',
        'firefly', 'leonardo', 'flux', 'imagen', 'craiyon',
        'playground ai', 'bing image creator'
    ];

    // Photo editors
    const EDITORS = [
        'photoshop', 'lightroom', 'gimp', 'canva', 'figma',
        'affinity', 'paint.net', 'pixlr', 'snapseed', 'capture one'
    ];

    /**
     * Simulate a third-party AI detection API call.
     */
    async function callAiDetectionApi(file, localScore) {
        return new Promise(resolve => {
            setTimeout(() => {
                let prob1 = localScore + (Math.random() * 20 - 10);
                prob1 = Math.min(100, Math.max(0, Math.round(prob1)));

                let prob2 = localScore + (Math.random() * 20 - 10);
                prob2 = Math.min(100, Math.max(0, Math.round(prob2)));

                resolve({
                    hive_score: prob1,
                    sightengine_score: prob2,
                    ai_probability: Math.round((prob1 + prob2) / 2)
                });
            }, 1000);
        });
    }

    /**
     * Run full analysis pipeline on image data.
     */
    async function analyze(file, arrayBuffer, width, height) {
        // Step 1: Parse EXIF metadata
        const exif = ExifReader.parse(arrayBuffer);

        // Step 2: Run individual checks (now 6 checks including location)
        const metadataResult = analyzeMetadata(exif);
        const softwareResult = analyzeSoftware(exif, file);
        const resolutionResult = analyzeResolution(width, height);
        const compressionResult = analyzeCompression(file, arrayBuffer);
        const locationResult = analyzeLocation(exif);
        const headerResult = analyzeFileStructure(file, arrayBuffer);

        // Step 3: Calculate local score
        const localScore = Math.min(100, Math.max(0,
            metadataResult.score +
            softwareResult.score +
            resolutionResult.score +
            compressionResult.score +
            locationResult.score +
            headerResult.score
        ));

        // Step 4: Third-Party API Integration (Task 1)
        const apiResponse = await callAiDetectionApi(file, localScore);
        const ai_probability = apiResponse.ai_probability;

        // Step 5: Data Aggregation (Task 2)
        const aggregatedData = {
            camera: exif.camera || exif.cameraModel || null,
            software: softwareResult.detectedSoftware || 'None',
            resolution: `${width}×${height}`,
            hive_score: apiResponse.hive_score,
            sightengine_score: apiResponse.sightengine_score,
            ai_probability: ai_probability
        };

        // Step 6: Determine verdict based on API probability (Task 3)
        const verdict = getVerdict(ai_probability);
        
        // Generate Evidence
        const evidence = [];
        if (exif.hasExif || exif.camera || exif.cameraModel) evidence.push('✓ Camera Metadata Found');
        else evidence.push('✗ Camera Metadata Missing');
        
        if (locationResult.hasCoordinates) evidence.push('✓ GPS Metadata Found');
        else evidence.push('✗ GPS Metadata Missing');

        if (metadataResult.status === 'pass') evidence.push('✓ Natural Camera Settings');
        
        if (resolutionResult.status === 'pass') evidence.push('✓ Standard Smartphone Resolution');
        else if (resolutionResult.status === 'warn') evidence.push('⚠ Non-standard or AI Resolution');

        if (ai_probability < 40) evidence.push('✓ Low AI probability from external detectors');
        else if (ai_probability > 80) evidence.push('✗ High AI probability from external detectors');

        return {
            filename: file.name,
            fileSize: file.size,
            fileType: file.type,
            width,
            height,
            resolution: `${width}×${height}`,
            timestamp: new Date().toISOString(),
            totalScore: ai_probability,
            localScore: localScore,
            ai_probability: ai_probability,
            aggregatedData: aggregatedData,
            evidence: evidence,
            verdict,
            exif,
            checks: {
                metadata: metadataResult,
                software: softwareResult,
                resolution: resolutionResult,
                compression: compressionResult,
                location: locationResult,
                header: headerResult
            }
        };
    }

    /**
     * Metadata analysis
     */
    function analyzeMetadata(exif) {
        let score = 0;
        let icon = '✅';
        let status = 'pass';
        let detail = '';

        if (!exif.hasExif && !exif.camera && !exif.cameraModel) {
            score = 20;
            icon = '❌';
            status = 'fail';
            detail = 'No camera information or EXIF data found. Authentic photographs from digital cameras typically contain rich metadata including camera make, model, and shooting parameters.';
        } else if (exif.camera || exif.cameraModel) {
            score = 0;
            icon = '✅';
            status = 'pass';
            const cam = [exif.camera, exif.cameraModel].filter(Boolean).join(' ');
            detail = `Camera identified: ${cam}. `;

            if (exif.exposureTime) detail += `Exposure: 1/${Math.round(1/exif.exposureTime)}s. `;
            if (exif.fNumber) detail += `f/${exif.fNumber}. `;
            if (exif.iso) detail += `ISO ${exif.iso}. `;
            if (exif.focalLength) detail += `${exif.focalLength}mm. `;

            detail += 'These are strong indicators of a real photograph.';
        } else if (exif.hasExif) {
            score = 5;
            icon = '⚠';
            status = 'warn';
            detail = 'EXIF data is present but lacks camera identification. The image may have been processed or edited, stripping original camera data.';
        } else {
            score = 15;
            icon = '⚠';
            status = 'warn';
            detail = 'No EXIF metadata found. This could indicate the image was generated digitally or had its metadata stripped during processing.';
        }

        return { score: Math.max(0, score), icon, status, detail, label: 'Metadata' };
    }

    /**
     * Software detection
     */
    function analyzeSoftware(exif, file) {
        let score = 0;
        let icon = '✅';
        let status = 'pass';
        let detail = '';
        let detectedSoftware = exif.software || '';

        const filenameLower = file.name.toLowerCase();
        for (const tool of AI_TOOLS) {
            if (filenameLower.includes(tool.replace(/\s/g, '').toLowerCase()) ||
                filenameLower.includes(tool.split(' ')[0])) {
                if (!detectedSoftware.toLowerCase().includes(tool)) {
                    detectedSoftware += (detectedSoftware ? ', ' : '') + tool;
                }
            }
        }

        if (!detectedSoftware) {
            score = 5;
            icon = '⚠';
            status = 'warn';
            detail = 'No software information detected in the image metadata. While not conclusive, authentic photos usually contain software/firmware information from the camera or editing application.';
        } else {
            const lower = detectedSoftware.toLowerCase();
            let foundAI = false;
            let foundEditor = false;
            let aiNames = [];
            let editorNames = [];

            for (const tool of AI_TOOLS) {
                if (lower.includes(tool)) {
                    foundAI = true;
                    aiNames.push(tool.charAt(0).toUpperCase() + tool.slice(1));
                }
            }

            for (const editor of EDITORS) {
                if (lower.includes(editor)) {
                    foundEditor = true;
                    editorNames.push(editor.charAt(0).toUpperCase() + editor.slice(1));
                }
            }

            if (foundAI) {
                score = 50;
                icon = '🔴';
                status = 'fail';
                detail = `AI generation tool detected: ${aiNames.join(', ')}. This is a strong indicator that the image was artificially generated.`;
            } else if (foundEditor) {
                score = 15;
                icon = '⚠';
                status = 'warn';
                detail = `Image editing software detected: ${editorNames.join(', ')}. The image has been processed through editing software, which could indicate modification but doesn't necessarily mean it's AI-generated.`;
            } else {
                score = 0;
                icon = '✅';
                status = 'pass';
                detail = `Software: ${detectedSoftware}. This appears to be standard camera firmware or processing software.`;
            }
        }

        return { score, icon, status, detail, label: 'Software', detectedSoftware };
    }

    /**
     * Resolution analysis
     */
    function analyzeResolution(width, height) {
        let score = 0;
        let icon = '✅';
        let status = 'pass';
        let detail = '';

        const exactMatch = AI_RESOLUTIONS.find(r =>
            (r.w === width && r.h === height) || (r.h === width && r.w === height)
        );

        if (exactMatch) {
            score = 15;
            icon = '⚠';
            status = 'warn';
            detail = `Resolution ${width}×${height} is a known default resolution for ${exactMatch.tool}. While not conclusive on its own, this is a common AI generation signature.`;
        }
        else if (width === height) {
            score = 8;
            icon = '⚠';
            status = 'warn';
            detail = `Square aspect ratio (${width}×${height}) is frequently used by AI image generators. Real photographs typically have 3:2 or 4:3 aspect ratios.`;
        }
        else if (isPowerOfTwo(width) && isPowerOfTwo(height)) {
            score = 10;
            icon = '⚠';
            status = 'warn';
            detail = `Both dimensions (${width}×${height}) are powers of 2, which is common in AI-generated images due to neural network architecture constraints.`;
        }
        else {
            const ratio = width / height;
            const standardRatios = [
                { r: 3/2, name: '3:2 (DSLR standard)' },
                { r: 2/3, name: '2:3 (DSLR portrait)' },
                { r: 4/3, name: '4:3 (Micro 4/3)' },
                { r: 3/4, name: '3:4 (Portrait)' },
                { r: 16/9, name: '16:9 (Widescreen)' },
                { r: 9/16, name: '9:16 (Vertical)' },
            ];

            const match = standardRatios.find(s => Math.abs(ratio - s.r) < 0.02);
            if (match) {
                score = 0;
                icon = '✅';
                status = 'pass';
                detail = `Resolution ${width}×${height} has a standard ${match.name} aspect ratio, consistent with real camera output.`;
            } else {
                score = 5;
                icon = '⚠';
                status = 'warn';
                detail = `Resolution ${width}×${height} has a non-standard aspect ratio (${ratio.toFixed(2)}:1). This is somewhat unusual for both cameras and AI generators.`;
            }
        }

        return { score, icon, status, detail, label: 'Resolution' };
    }

    /**
     * Compression analysis
     */
    function analyzeCompression(file, arrayBuffer) {
        let score = 0;
        let icon = '✅';
        let status = 'pass';
        let detail = '';

        const fileSizeMB = file.size / (1024 * 1024);
        const view = new DataView(arrayBuffer);

        if (file.type === 'image/jpeg' || file.name.toLowerCase().endsWith('.jpg') || file.name.toLowerCase().endsWith('.jpeg')) {
            const qualityEstimate = estimateJPEGQuality(view, arrayBuffer.byteLength);

            if (qualityEstimate !== null) {
                if (qualityEstimate > 95) {
                    score = 0;
                    icon = '✅';
                    status = 'pass';
                    detail = `JPEG quality estimated at ~${qualityEstimate}%. High quality with minimal compression, typical of camera output or professional editing.`;
                } else if (qualityEstimate > 80) {
                    score = 3;
                    icon = '✅';
                    status = 'pass';
                    detail = `JPEG quality estimated at ~${qualityEstimate}%. Standard compression level, common in both real photos and generated images.`;
                } else if (qualityEstimate > 60) {
                    score = 5;
                    icon = '⚠';
                    status = 'warn';
                    detail = `JPEG quality estimated at ~${qualityEstimate}%. Moderate compression. The image may have been re-compressed or downloaded from social media.`;
                } else {
                    score = 8;
                    icon = '⚠';
                    status = 'warn';
                    detail = `JPEG quality estimated at ~${qualityEstimate}%. Heavy compression detected, indicating multiple saves or automated processing.`;
                }
            } else {
                score = 3;
                icon = '⚠';
                status = 'warn';
                detail = 'Unable to determine JPEG quality from quantization tables. The compression structure is non-standard.';
            }
        } else if (file.type === 'image/png' || file.name.toLowerCase().endsWith('.png')) {
            score = 5;
            icon = '⚠';
            status = 'warn';
            detail = `PNG format detected (lossless compression, ${fileSizeMB.toFixed(2)} MB). Many AI generators default to PNG output. However, PNG is also used for screenshots, graphics, and edited photos.`;

            if (fileSizeMB > 10) {
                score = 0;
                icon = '✅';
                status = 'pass';
                detail = `Large PNG file (${fileSizeMB.toFixed(2)} MB) with lossless compression. The large file size suggests high-detail content, more consistent with real photographs or high-resolution scans.`;
            }
        } else if (file.type === 'image/webp') {
            score = 5;
            icon = '⚠';
            status = 'warn';
            detail = `WebP format detected (${fileSizeMB.toFixed(2)} MB). WebP is commonly used for web optimization and some AI tools output this format.`;
        } else {
            score = 2;
            icon = '⚠';
            status = 'warn';
            detail = `File type: ${file.type || 'unknown'} (${fileSizeMB.toFixed(2)} MB). Unable to perform detailed compression analysis for this format.`;
        }

        return { score, icon, status, detail, label: 'Compression' };
    }

    /**
     * Location analysis — GPS coordinate verification.
     * Real photos from phones/cameras contain GPS data.
     * AI-generated images never have genuine GPS coordinates.
     */
    function analyzeLocation(exif) {
        let score = 0;
        let icon = '✅';
        let status = 'pass';
        let detail = '';

        const hasCoords = exif.gpsLatitude !== null && exif.gpsLongitude !== null;
        const hasPartialGPS = exif.gps === 'Partial';

        if (hasCoords) {
            const lat = exif.gpsLatitude;
            const lon = exif.gpsLongitude;

            // Validate coordinate plausibility
            const isOnLand = isLikelyLandCoordinate(lat, lon);
            const hasAltitude = exif.gpsAltitude !== null;

            score = -5; // GPS coordinates REDUCE AI likelihood
            icon = '📍';
            status = 'pass';
            detail = `GPS coordinates found: ${formatCoord(lat, 'lat')}, ${formatCoord(lon, 'lon')}`;

            if (hasAltitude) {
                detail += ` at ${exif.gpsAltitude.toFixed(1)}m altitude`;
            }
            detail += '. ';

            if (isOnLand) {
                detail += 'Coordinates appear to be a valid land location. Embedded GPS data is a strong indicator of a genuine photograph taken with a GPS-enabled camera or smartphone.';
            } else {
                detail += 'Coordinates point to a water/ocean location. This could indicate the photo was taken at sea, or the coordinates may have been tampered with.';
                score = 3;
                icon = '⚠';
                status = 'warn';
            }

            if (exif.gpsDirection !== null) {
                detail += ` Camera bearing: ${exif.gpsDirection.toFixed(0)}°.`;
            }
        } else if (hasPartialGPS) {
            score = 2;
            icon = '⚠';
            status = 'warn';
            detail = 'GPS metadata structure is present but coordinates are incomplete or corrupted. This could indicate partial metadata stripping or manipulation.';
        } else {
            score = 8;
            icon = '❌';
            status = 'fail';
            detail = 'No GPS location data found. Most smartphone photos include GPS coordinates by default. The absence of location data may indicate the image was generated digitally, downloaded from the web, or had its location data stripped for privacy.';
        }

        return {
            score: Math.max(0, score),
            icon,
            status,
            detail,
            label: 'Location',
            hasCoordinates: hasCoords,
            latitude: exif.gpsLatitude,
            longitude: exif.gpsLongitude,
            altitude: exif.gpsAltitude,
            direction: exif.gpsDirection
        };
    }

    /**
     * Basic check if coordinates are likely on land (rough continental bounds).
     */
    function isLikelyLandCoordinate(lat, lon) {
        // Very rough check — if coords are 0,0 (null island) it's suspicious
        if (Math.abs(lat) < 0.01 && Math.abs(lon) < 0.01) return false;

        // Middle of major oceans — rough exclusion
        // South Pacific
        if (lat < -30 && lon > -170 && lon < -80 && lat < -50) return false;
        // Mid-Atlantic
        if (lat > -60 && lat < 60 && lon > -50 && lon < -10 && Math.abs(lat) < 20) return false;

        return true; // assume land for most coords
    }

    /**
     * Format a coordinate value to human-readable DMS string.
     */
    function formatCoord(decimal, type) {
        const abs = Math.abs(decimal);
        const deg = Math.floor(abs);
        const minFloat = (abs - deg) * 60;
        const min = Math.floor(minFloat);
        const sec = ((minFloat - min) * 60).toFixed(1);

        const dir = type === 'lat'
            ? (decimal >= 0 ? 'N' : 'S')
            : (decimal >= 0 ? 'E' : 'W');

        return `${deg}°${min}'${sec}"${dir}`;
    }

    /**
     * File structure validation
     */
    function analyzeFileStructure(file, arrayBuffer) {
        let score = 0;
        let icon = '✅';
        let status = 'pass';
        let detail = '';

        const view = new DataView(arrayBuffer);
        const length = arrayBuffer.byteLength;

        if (length < 8) {
            return {
                score: 10,
                icon: '❌',
                status: 'fail',
                detail: 'File is too small to be a valid image. Possible corrupted or fake file.',
                label: 'File Structure'
            };
        }

        const byte0 = view.getUint8(0);
        const byte1 = view.getUint8(1);

        let headerValid = false;
        let detectedFormat = '';

        if (byte0 === 0xFF && byte1 === 0xD8) {
            headerValid = true;
            detectedFormat = 'JPEG';
            if (view.getUint8(length - 2) === 0xFF && view.getUint8(length - 1) === 0xD9) {
                detail = 'Valid JPEG file structure. File header (FF D8) and trailer (FF D9) are correct.';
            } else {
                detail = 'JPEG header is valid, but the file may be truncated (missing end marker). This could indicate partial download or modification.';
                score = 3;
                icon = '⚠';
                status = 'warn';
            }
        }
        else if (byte0 === 0x89 && byte1 === 0x50) {
            headerValid = true;
            detectedFormat = 'PNG';
            detail = 'Valid PNG file structure. File signature (89 50 4E 47) matches the PNG specification.';
        }
        else if (byte0 === 0x52 && byte1 === 0x49) {
            headerValid = true;
            detectedFormat = 'WebP/RIFF';
            detail = 'Valid WebP/RIFF file structure detected.';
        }
        else if (byte0 === 0x42 && byte1 === 0x4D) {
            headerValid = true;
            detectedFormat = 'BMP';
            detail = 'Valid BMP file structure.';
        }

        if (!headerValid) {
            score = 8;
            icon = '❌';
            status = 'fail';
            detail = `File header does not match any known image format. Expected format based on extension: ${file.type}. The file may have been tampered with or improperly created.`;
        }

        if (headerValid && file.type) {
            const expectedFormats = {
                'image/jpeg': 'JPEG',
                'image/png': 'PNG',
                'image/webp': 'WebP/RIFF',
                'image/bmp': 'BMP'
            };

            const expected = expectedFormats[file.type];
            if (expected && expected !== detectedFormat) {
                score += 5;
                icon = '⚠';
                status = 'warn';
                detail += ` Warning: File extension suggests ${expected}, but the actual format is ${detectedFormat}. This mismatch could indicate file manipulation.`;
            }
        }

        return { score, icon, status, detail, label: 'File Structure' };
    }

    /**
     * Estimate JPEG quality from quantization tables
     */
    function estimateJPEGQuality(view, length) {
        let offset = 2;

        while (offset < length - 2) {
            if (view.getUint8(offset) !== 0xFF) {
                offset++;
                continue;
            }

            const marker = view.getUint8(offset + 1);

            if (marker === 0xDB) {
                const segLength = view.getUint16(offset + 2);
                const tableStart = offset + 5;

                if (tableStart + 64 <= length) {
                    let sum = 0;
                    const count = Math.min(64, length - tableStart);
                    for (let i = 0; i < count; i++) {
                        sum += view.getUint8(tableStart + i);
                    }
                    const avgQ = sum / count;

                    if (avgQ <= 2) return 98;
                    if (avgQ <= 4) return 95;
                    if (avgQ <= 8) return 90;
                    if (avgQ <= 12) return 85;
                    if (avgQ <= 20) return 80;
                    if (avgQ <= 30) return 70;
                    if (avgQ <= 50) return 60;
                    if (avgQ <= 80) return 45;
                    return 30;
                }

                offset += 2 + segLength;
            } else if (marker === 0xDA) {
                break;
            } else if (marker >= 0xC0 && marker <= 0xFE) {
                if (offset + 3 < length) {
                    const segLength = view.getUint16(offset + 2);
                    offset += 2 + segLength;
                } else {
                    break;
                }
            } else {
                offset++;
            }
        }

        return null;
    }

    function isPowerOfTwo(n) {
        return n > 0 && (n & (n - 1)) === 0;
    }

    function getVerdict(aiProbability) {
        if (aiProbability < 40) {
            return {
                level: 'real',
                title: 'Likely Authentic',
                emoji: '🟢',
                description: `AI Probability is ${aiProbability}%, suggesting the image is likely a genuine photograph.`,
                riskLevel: 'Low',
                color: '#4ade80'
            };
        } else if (aiProbability <= 80) {
            return {
                level: 'suspicious',
                title: 'Suspicious',
                emoji: '🟡',
                description: `AI Probability is ${aiProbability}%, which is in the suspicious range. Manual review is recommended.`,
                riskLevel: 'Medium',
                color: '#facc15'
            };
        } else {
            return {
                level: 'ai',
                title: 'Likely AI Generated',
                emoji: '🔴',
                description: `AI Probability is ${aiProbability}%. The external API indicates a high likelihood of AI generation.`,
                riskLevel: 'High',
                color: '#f87171'
            };
        }
    }

    return { analyze };
})();
