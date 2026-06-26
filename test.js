const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
    try {
        const browser = await puppeteer.launch({ headless: true });
        const page = await browser.newPage();
        
        page.on('console', msg => console.log('PAGE LOG:', msg.text()));
        page.on('pageerror', err => console.error('PAGE ERROR:', err));

        await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' });
        
        console.log('Logging in...');
        await page.type('#login-username', 'testuser');
        await page.type('#login-password', 'Password123!');
        await page.click('#btn-login-submit');
        await page.waitForSelector('#dash-user-name');
        
        console.log('Logged in. Faking location coordinates in app.js or mocking the map...');
        // Let's directly execute window.AppController.init() and mock renderLocationMap
        await page.evaluate(() => {
            // Mock a result with coordinates
            const mockResult = {
                checks: {
                    location: {
                        hasCoordinates: true,
                        latitude: 37.7749,
                        longitude: -122.4194,
                        altitude: null
                    }
                }
            };
            
            // The function is internal, so we have to trigger the analyze button.
            // But we don't have a real image with EXIF.
        });
        
        await browser.close();
    } catch (err) {
        console.error(err);
    }
})();
