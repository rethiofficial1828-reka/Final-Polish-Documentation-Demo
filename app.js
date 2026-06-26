/**
 * App v2.0 — Main application controller.
 * Handles UI interactions, file upload, analysis pipeline,
 * report rendering, interactive map, and reverse geocoding.
 */

(function () {
    'use strict';

    // DOM Elements
    const uploadArea = document.getElementById('uploadArea');
    const uploadContent = document.getElementById('uploadContent');
    const previewContainer = document.getElementById('previewContainer');
    const previewImage = document.getElementById('previewImage');
    const previewName = document.getElementById('previewName');
    const previewSize = document.getElementById('previewSize');
    const fileInput = document.getElementById('fileInput');
    const btnRemove = document.getElementById('btnRemove');
    const analyzeBtn = document.getElementById('analyzeBtn');
    const pipelineSection = document.getElementById('pipelineSection');
    const reportSection = document.getElementById('reportSection');
    const btnDownloadReport = document.getElementById('btnDownloadReport');
    const btnNewAnalysis = document.getElementById('btnNewAnalysis');

    // State
    let currentFile = null;
    let currentArrayBuffer = null;
    let currentResult = null;
    let leafletMap = null;

    // ==========================================
    // UI EVENTS
    // ==========================================
    const btnRevealMap = document.getElementById('btnRevealMap');
    if(btnRevealMap) {
        btnRevealMap.addEventListener('click', () => {
            const mapWrapper = document.getElementById('mapWrapper');
            const locDetails = document.getElementById('locDetailsWrapper');
            if(mapWrapper.style.display === 'none') {
                mapWrapper.style.display = 'block';
                locDetails.style.display = 'block';
                btnRevealMap.textContent = 'Hide Map';
                if(leafletMap) {
                    setTimeout(() => leafletMap.invalidateSize(), 100);
                }
            } else {
                mapWrapper.style.display = 'none';
                locDetails.style.display = 'none';
                btnRevealMap.textContent = 'Reveal Map';
            }
        });
    }

    // ==========================================
    // FILE UPLOAD HANDLING
    // ==========================================

    uploadArea.addEventListener('click', (e) => {
        if (e.target.closest('.btn-remove')) return;
        fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFile(e.target.files[0]);
        }
    });

    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('drag-over');
    });

    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('drag-over');
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('drag-over');
        if (e.dataTransfer.files.length > 0) {
            handleFile(e.dataTransfer.files[0]);
        }
    });

    btnRemove.addEventListener('click', (e) => {
        e.stopPropagation();
        resetUpload();
    });

    analyzeBtn.addEventListener('click', () => {
        if (currentFile && currentArrayBuffer) {
            startAnalysis();
        }
    });

    btnNewAnalysis.addEventListener('click', () => {
        resetAll();
    });

    btnDownloadReport.addEventListener('click', () => {
        if (currentResult) {
            downloadReport(currentResult);
        }
    });

    function handleFile(file) {
        if (!file.type.startsWith('image/')) {
            showToast('Only JPG, PNG, WEBP Allowed');
            return;
        }

        if (file.size > 50 * 1024 * 1024) {
            showToast('File Too Large');
            return;
        }

        currentFile = file;

        const reader = new FileReader();
        reader.onload = (e) => {
            currentArrayBuffer = e.target.result;
        };
        reader.readAsArrayBuffer(file);

        const previewReader = new FileReader();
        previewReader.onload = (e) => {
            previewImage.src = e.target.result;
        };
        previewReader.readAsDataURL(file);

        previewName.textContent = file.name;
        previewSize.textContent = formatFileSize(file.size);

        uploadContent.style.display = 'none';
        previewContainer.style.display = 'flex';
        analyzeBtn.disabled = false;

        pipelineSection.style.display = 'none';
        reportSection.style.display = 'none';
    }

    function resetUpload() {
        currentFile = null;
        currentArrayBuffer = null;
        fileInput.value = '';
        previewImage.src = '';
        uploadContent.style.display = 'flex';
        previewContainer.style.display = 'none';
        analyzeBtn.disabled = true;
    }

    function resetAll() {
        resetUpload();
        pipelineSection.style.display = 'none';
        reportSection.style.display = 'none';
        currentResult = null;

        // Destroy existing map
        if (leafletMap) {
            leafletMap.remove();
            leafletMap = null;
        }

        document.getElementById('upload').scrollIntoView({ behavior: 'smooth' });
    }

    // ==========================================
    // ANALYSIS PIPELINE
    // ==========================================

    async function startAnalysis() {
        analyzeBtn.disabled = true;
        analyzeBtn.innerHTML = `
            <svg class="btn-spinner" viewBox="0 0 24 24" width="20" height="20">
                <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2" 
                        stroke-dasharray="30 30" stroke-linecap="round">
                    <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" 
                                      dur="0.8s" repeatCount="indefinite"/>
                </circle>
            </svg>
            Analyzing...
        `;

        pipelineSection.style.display = 'block';
        reportSection.style.display = 'none';

        setTimeout(() => {
            pipelineSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);

        // Reset all steps
        const steps = ['metadata', 'software', 'resolution', 'compression', 'location', 'header', 'api'];
        steps.forEach(step => {
            const el = document.getElementById(`step-${step}`);
            el.classList.remove('active', 'done');
            document.getElementById(`status-${step}`).textContent = 'Pending';
        });

        // Load image to get dimensions
        const img = new Image();
        const imageUrl = URL.createObjectURL(currentFile);

        await new Promise((resolve) => {
            img.onload = resolve;
            img.onerror = resolve;
            img.src = imageUrl;
        });

        const width = img.naturalWidth || img.width || 0;
        const height = img.naturalHeight || img.height || 0;
        URL.revokeObjectURL(imageUrl);

        if (width === 0 || height === 0) {
            pipelineSection.style.display = 'none';
            showToast('Error: Invalid Image File');
            resetUpload();
            return;
        }

        // Run pipeline steps with animation
        const stepNames = ['metadata', 'software', 'resolution', 'compression', 'location', 'header', 'api'];
        const statusMessages = [
            'Extracting EXIF...',
            'Scanning software...',
            'Checking patterns...',
            'Analyzing quality...',
            'Tracking GPS...',
            'Validating structure...',
            'Querying AI Detection...'
        ];

        for (let i = 0; i < stepNames.length; i++) {
            const step = stepNames[i];
            const el = document.getElementById(`step-${step}`);
            const statusEl = document.getElementById(`status-${step}`);

            el.classList.add('active');
            statusEl.textContent = statusMessages[i];

            await delay(500 + Math.random() * 400);

            el.classList.remove('active');
            el.classList.add('done');
            statusEl.textContent = 'Complete';
        }

        // Run actual analysis
        const result = await ImageAnalyzer.analyze(currentFile, currentArrayBuffer, width, height);
        currentResult = result;

        await delay(400);

        renderReport(result);

        analyzeBtn.disabled = false;
        analyzeBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
                <circle cx="11" cy="11" r="8"/>
                <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            Run Full Analysis
        `;
    }

    // ==========================================
    // REPORT RENDERING
    // ==========================================

    function renderReport(result) {
        reportSection.style.display = 'block';

        setTimeout(() => {
            reportSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);

        // Header
        document.getElementById('reportThumb').src = previewImage.src;
        document.getElementById('reportFilename').textContent = result.filename;
        document.getElementById('reportTimestamp').textContent = new Date(result.timestamp).toLocaleString();

        // Badge
        const badge = document.getElementById('reportBadge');
        badge.className = 'report-badge';
        if (result.verdict.level === 'real') {
            badge.classList.add('badge-real');
            badge.textContent = 'Likely Real';
        } else if (result.verdict.level === 'suspicious') {
            badge.classList.add('badge-suspicious');
            badge.textContent = 'Suspicious';
        } else {
            badge.classList.add('badge-ai');
            badge.textContent = 'Likely AI';
        }

        // Score gauge
        const gaugeFill = document.getElementById('gaugeFill');
        const gaugeScore = document.getElementById('gaugeScore');
        const circumference = 2 * Math.PI * 85;
        const targetOffset = circumference - (result.totalScore / 100) * circumference;

        if (result.ai_probability < 40) {
            gaugeFill.style.stroke = '#4ade80';
            gaugeScore.style.color = '#4ade80';
        } else if (result.ai_probability <= 80) {
            gaugeFill.style.stroke = '#facc15';
            gaugeScore.style.color = '#facc15';
        } else {
            gaugeFill.style.stroke = '#f87171';
            gaugeScore.style.color = '#f87171';
        }

        // Reset gauge for re-animation
        gaugeFill.style.strokeDashoffset = circumference;

        setTimeout(() => {
            gaugeFill.style.strokeDashoffset = targetOffset;
        }, 200);

        animateCounter(gaugeScore, 0, result.ai_probability, 1500);

        // Populate Overview Data
        document.getElementById('overviewExif').innerHTML = result.checks.metadata.status === 'pass' ? '✅ Present' : '❌ Missing';
        document.getElementById('overviewCamera').textContent = result.aggregatedData.camera || 'None';
        document.getElementById('overviewSoftware').textContent = result.aggregatedData.software;
        document.getElementById('overviewResolution').textContent = result.resolution.replace('×', ' × ');
        document.getElementById('overviewGps').innerHTML = result.checks.location.hasCoordinates ? '✅ Present' : '❌ Missing';
        
        document.getElementById('overviewHive').textContent = `${result.aggregatedData.hive_score}%`;
        document.getElementById('overviewSightengine').textContent = `${result.aggregatedData.sightengine_score}%`;
        document.getElementById('overviewAiProb').textContent = `${result.ai_probability}%`;
        document.getElementById('overviewAiProb').style.color = result.verdict.color;

        document.getElementById('overviewRisk').textContent = result.verdict.riskLevel;
        document.getElementById('overviewEvidence').textContent = result.evidence.join('\n');

        // Verdict box
        const verdictBox = document.getElementById('verdictBox');
        verdictBox.className = 'verdict-box';
        verdictBox.classList.add(`verdict-${result.verdict.level}`);
        document.getElementById('verdictIcon').textContent = result.verdict.emoji;
        document.getElementById('verdictTitle').textContent = result.verdict.title;
        document.getElementById('verdictDesc').textContent = result.verdict.description;

        // Location Map
        renderLocationMap(result);

        // Findings (now 6 checks)
        const checks = ['metadata', 'software', 'resolution', 'compression', 'location', 'header'];
        checks.forEach(check => {
            const data = result.checks[check];

            document.getElementById(`icon-${check}`).textContent = data.icon;
            document.getElementById(`detail-${check}`).textContent = data.detail;

            const pointsEl = document.getElementById(`points-${check}`);
            if (data.score > 0) {
                pointsEl.textContent = `+${data.score} pts`;
                if (data.score >= 15) {
                    pointsEl.className = 'finding-points points-positive';
                } else if (data.score >= 5) {
                    pointsEl.className = 'finding-points points-neutral';
                } else {
                    pointsEl.className = 'finding-points points-safe';
                }
            } else {
                pointsEl.textContent = '0 pts';
                pointsEl.className = 'finding-points points-safe';
            }
        });

        // Breakdown bars
        const breakdownBars = document.getElementById('breakdownBars');
        breakdownBars.innerHTML = '';

        const barColors = {
            metadata: '#6c63ff',
            software: '#a855f7',
            resolution: '#ec4899',
            compression: '#fb923c',
            location: '#22d3ee',
            header: '#06b6d4'
        };

        const barLabels = {
            metadata: 'Metadata',
            software: 'Software',
            resolution: 'Resolution',
            compression: 'Compression',
            location: 'Location',
            header: 'File Structure'
        };

        checks.forEach((check) => {
            const data = result.checks[check];
            const maxForCheck = check === 'software' ? 50 : (check === 'metadata' ? 20 : 15);
            const percentage = Math.min(100, (data.score / maxForCheck) * 100);

            const row = document.createElement('div');
            row.className = 'bar-row';
            row.innerHTML = `
                <span class="bar-label">${barLabels[check]}</span>
                <div class="bar-track">
                    <div class="bar-fill" style="background:${barColors[check]};" data-width="${percentage}%"></div>
                </div>
                <span class="bar-value">+${data.score}</span>
            `;
            breakdownBars.appendChild(row);
        });

        setTimeout(() => {
            breakdownBars.querySelectorAll('.bar-fill').forEach(bar => {
                bar.style.width = bar.dataset.width;
            });
        }, 400);
    }

    // ==========================================
    // LOCATION MAP RENDERING
    // ==========================================

    function renderLocationMap(result) {
        const locationData = result.checks.location;
        const locationSection = document.getElementById('locationSection');
        const noLocationSection = document.getElementById('noLocationSection');

        // Destroy existing map
        if (leafletMap) {
            leafletMap.remove();
            leafletMap = null;
        }

        if (locationData.hasCoordinates && locationData.latitude !== null && locationData.longitude !== null) {
            // Show map section, hide no-location
            locationSection.style.display = 'block';
            noLocationSection.style.display = 'none';

            const lat = locationData.latitude;
            const lon = locationData.longitude;

            // Set detail values
            document.getElementById('locLatitude').textContent = formatDMS(lat, 'lat');
            document.getElementById('locLongitude').textContent = formatDMS(lon, 'lon');
            document.getElementById('locAltitude').textContent = locationData.altitude !== null
                ? `${locationData.altitude.toFixed(1)}m`
                : '—';
            document.getElementById('locAddress').textContent = 'Looking up...';

            // Initialize Leaflet map after DOM is ready
            setTimeout(() => {
                try {
                    leafletMap = L.map('locationMap', {
                        center: [lat, lon],
                        zoom: 14,
                        zoomControl: true,
                        attributionControl: true
                    });

                    // Use OpenStreetMap tiles
                    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                        attribution: '© <a href="https://www.openstreetmap.org/">OSM</a>',
                        maxZoom: 18
                    }).addTo(leafletMap);

                    // Custom marker icon using SVG
                    const markerIcon = L.divIcon({
                        className: 'custom-marker',
                        html: `<div style="
                            width: 32px; height: 32px;
                            background: linear-gradient(135deg, #6c63ff, #ec4899);
                            border-radius: 50% 50% 50% 0;
                            transform: rotate(-45deg);
                            border: 3px solid white;
                            box-shadow: 0 4px 16px rgba(0,0,0,0.4);
                            display: flex; align-items: center; justify-content: center;
                        "><div style="
                            width: 10px; height: 10px;
                            background: white;
                            border-radius: 50%;
                            transform: rotate(45deg);
                        "></div></div>`,
                        iconSize: [32, 32],
                        iconAnchor: [16, 32],
                        popupAnchor: [0, -32]
                    });

                    const marker = L.marker([lat, lon], { icon: markerIcon }).addTo(leafletMap);

                    marker.bindPopup(`
                        <div style="padding: 4px;">
                            <strong style="font-size: 0.9rem;">📍 Photo Location</strong><br>
                            <span style="font-size: 0.8rem; opacity: 0.8;">
                                ${formatDMS(lat, 'lat')}<br>
                                ${formatDMS(lon, 'lon')}
                            </span>
                        </div>
                    `).openPopup();

                    // Add accuracy circle
                    L.circle([lat, lon], {
                        radius: 100,
                        color: '#6c63ff',
                        fillColor: '#6c63ff',
                        fillOpacity: 0.1,
                        weight: 1
                    }).addTo(leafletMap);

                    // Force map resize after display
                    setTimeout(() => {
                        leafletMap.invalidateSize();
                    }, 200);

                } catch (e) {
                    console.warn('Map initialization failed:', e);
                }

                // Reverse geocode the location
                reverseGeocode(lat, lon);

            }, 300);

        } else {
            // No GPS — show placeholder
            locationSection.style.display = 'none';
            noLocationSection.style.display = 'block';
        }
    }

    /**
     * Reverse geocode using OpenStreetMap Nominatim (free, no API key)
     */
    async function reverseGeocode(lat, lon) {
        const addressEl = document.getElementById('locAddress');

        try {
            const response = await fetch(
                `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=16&addressdetails=1`,
                {
                    headers: {
                        'Accept-Language': 'en',
                        'User-Agent': 'ImageVerify/2.0'
                    }
                }
            );

            if (response.ok) {
                const data = await response.json();
                if (data.display_name) {
                    // Shorten the address
                    const parts = data.display_name.split(',');
                    const shortAddress = parts.slice(0, 3).join(',').trim();
                    addressEl.textContent = shortAddress;

                    // Update marker popup if map exists
                    if (leafletMap) {
                        leafletMap.eachLayer(layer => {
                            if (layer instanceof L.Marker) {
                                layer.setPopupContent(`
                                    <div style="padding: 4px;">
                                        <strong style="font-size: 0.9rem;">📍 ${shortAddress}</strong><br>
                                        <span style="font-size: 0.78rem; opacity: 0.7;">
                                            ${formatDMS(lat, 'lat')}, ${formatDMS(lon, 'lon')}
                                        </span>
                                    </div>
                                `);
                            }
                        });
                    }
                } else {
                    addressEl.textContent = 'Address not found';
                }
            } else {
                addressEl.textContent = 'Lookup unavailable';
            }
        } catch (err) {
            addressEl.textContent = 'Lookup failed';
            console.warn('Reverse geocoding failed:', err);
        }
    }

    /**
     * Format decimal degrees to DMS string
     */
    function formatDMS(decimal, type) {
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

    // ==========================================
    // REPORT DOWNLOAD
    // ==========================================

    function downloadReport(result) {
        if (!window.jspdf) {
            showToast('PDF generation library not loaded.');
            return;
        }
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        // Helper to strip non-ASCII characters that break jsPDF's Helvetica font
        const clean = (str) => {
            if (!str) return '';
            return String(str)
                .replace(/✓/g, '[+] ')
                .replace(/✗/g, '[-] ')
                .replace(/⚠/g, '[!] ')
                .replace(/🔴/g, '')
                .replace(/🟡/g, '')
                .replace(/🟢/g, '')
                .replace(/[^\x00-\x7F]/g, ''); // Remove any remaining non-ASCII
        };

        // Colors
        doc.setTextColor(30, 30, 30);
        
        doc.setFontSize(22);
        doc.setFont("helvetica", "bold");
        doc.text('Authenticity Report', 20, 25);

        doc.setFontSize(11);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(100, 100, 100);
        doc.text(`Generated on: ${new Date().toLocaleString()}`, 20, 32);

        doc.setDrawColor(200, 200, 200);
        doc.line(20, 36, 190, 36);

        // File Details
        doc.setTextColor(30, 30, 30);
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.text('File Details', 20, 48);

        doc.setFontSize(12);
        doc.setFont("helvetica", "normal");
        doc.text(`Filename: ${clean(result.filename)}`, 20, 56);
        doc.text(`Resolution: ${clean(result.resolution)}`, 20, 64);
        
        // AI Score
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.text('AI Score', 20, 80);

        doc.setFontSize(12);
        doc.setFont("helvetica", "normal");
        doc.text(`Average AI Probability: ${result.ai_probability}%`, 20, 88);

        // Metadata
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.text('Metadata', 20, 104);

        doc.setFontSize(12);
        doc.setFont("helvetica", "normal");
        const exifStatus = result.checks.metadata.status === 'pass' ? 'Present' : 'Missing';
        doc.text(`EXIF Data: ${exifStatus}`, 20, 112);
        doc.text(`Camera: ${clean(result.aggregatedData.camera || 'None')}`, 20, 120);
        doc.text(`Software: ${clean(result.aggregatedData.software || 'None')}`, 20, 128);

        // Evidence
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.text('Evidence', 20, 144);

        doc.setFontSize(12);
        doc.setFont("helvetica", "normal");
        let y = 152;
        result.evidence.forEach(ev => {
            doc.text(clean(ev), 20, y);
            y += 8;
        });

        // Final Verdict
        y += 8;
        doc.setDrawColor(200, 200, 200);
        doc.line(20, y, 190, y);
        
        y += 12;
        doc.setFontSize(16);
        doc.setFont("helvetica", "bold");
        doc.text('Final Verdict', 20, y);

        y += 10;
        doc.setFontSize(14);
        const vText = result.verdict.level === 'real' ? 'LIKELY AUTHENTIC' : 
                      result.verdict.level === 'suspicious' ? 'SUSPICIOUS' : 'LIKELY AI GENERATED';
        
        if (result.verdict.level === 'real') doc.setTextColor(34, 197, 94);
        else if (result.verdict.level === 'suspicious') doc.setTextColor(234, 179, 8);
        else doc.setTextColor(239, 68, 68);

        doc.text(vText, 20, y);

        doc.save('authenticity-report.pdf');
    }

    function getConfidence(score) {
        if (score <= 10) return 95;
        if (score <= 20) return 90;
        if (score <= 30) return 85;
        if (score <= 40) return 75;
        if (score <= 50) return 70;
        if (score <= 60) return 65;
        if (score <= 70) return 60;
        if (score <= 80) return 80;
        if (score <= 90) return 88;
        return 92;
    }

    // ==========================================
    // UTILITIES
    // ==========================================

    function formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    }

    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function animateCounter(element, start, end, duration) {
        const startTime = performance.now();
        const diff = end - start;

        function update(currentTime) {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);

            const eased = 1 - Math.pow(1 - progress, 3);
            const current = Math.round(start + diff * eased);

            element.textContent = current;

            if (progress < 1) {
                requestAnimationFrame(update);
            }
        }

        requestAnimationFrame(update);
    }

    function showToast(message) {
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed;
            bottom: 32px;
            left: 50%;
            transform: translateX(-50%) translateY(20px);
            background: rgba(30, 30, 50, 0.95);
            color: #f0f0f5;
            padding: 12px 24px;
            border-radius: 12px;
            font-size: 0.875rem;
            font-weight: 500;
            border: 1px solid rgba(255,255,255,0.1);
            backdrop-filter: blur(12px);
            z-index: 1000;
            opacity: 0;
            transition: all 0.3s ease;
            font-family: 'Inter', sans-serif;
        `;
        toast.textContent = message;
        document.body.appendChild(toast);

        requestAnimationFrame(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateX(-50%) translateY(0)';
        });

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(-50%) translateY(20px)';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // Smooth scroll
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', (e) => {
            e.preventDefault();
            const target = document.querySelector(anchor.getAttribute('href'));
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });

})();
