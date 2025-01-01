// ==UserScript==
// @name         Topmeteo Arrows
// @namespace    http://tampermonkey.net/
// @version      0.7.3
// @description  Add Meteo-Parapente style arrows to the table!
// @author       Thomas Schüßler
// @match        https://*.topmeteo.eu/*/*/loc/*
// @grant        none
// ==/UserScript==

{
    'use strict';

    function map(num, inMin, inMax, outMin, outMax) {
        return (num - inMin) * (outMax - outMin) / (inMax - inMin) + outMin;
    }

    const usableHeightBackgroundColor = '#FFFFAA';
    const hslStart = 0;
    const hslEnd = 183; // 183 = green
    const minStrength = 0;
    const maxStrength = 40; // km/h

    const arrowSize = 20;
    const canvasWidth = 37;
    const canvasHeight = 20;

    // relative to size
    const minArrowHeadWidth = 3.0;
    const maxArrowHeadWidth = 7.0;

    // only upscale
    const scale = window.devicePixelRatio > 1 ? window.devicePixelRatio : 1;

    function getArrowColor(strength) {
        let hue = hslEnd - map(strength, minStrength, maxStrength, hslStart, hslEnd);
        let color = `hsl(${hue}, 100%, 45%)`;
        if (strength >= maxStrength) {
            color = `hsl(${hslStart}, 100%, 45%)`;
        }
        return color;
    }

    function drawArrow(size, angle, strength) {
        let canvas = document.createElement('canvas');
        let ctx = canvas.getContext('2d');

        ctx.fillStyle = getArrowColor(strength);
        ctx.lineWidth = Math.min(strength / 4, maxStrength / 3);

        ctx.translate(size / 2, size / 2);
        ctx.rotate(angle * Math.PI / 180);
        ctx.translate(-size / 2, -size / 2);

        let tailWidth = ctx.lineWidth;
        let arrowHeadLength = map(strength, minStrength, maxStrength, size / 4, size / 2);
        let tailHeight = size - arrowHeadLength;
        let arrowHeadWidth = map(strength, minStrength, maxStrength, minArrowHeadWidth, maxArrowHeadWidth);

        // draw the arrow
        ctx.beginPath();
        ctx.moveTo(size / 2 - tailWidth / 2, 0);
        ctx.lineTo(size / 2 + tailWidth / 2, 0);
        ctx.lineTo(size / 2 + tailWidth / 2, tailHeight);
        ctx.lineTo(size - size / arrowHeadWidth, size - arrowHeadLength);
        ctx.lineTo(size / 2, size);
        ctx.lineTo(size / arrowHeadWidth, size - arrowHeadLength);
        ctx.lineTo(size / 2 - tailWidth / 2, tailHeight);
        ctx.closePath();
        ctx.fill();
        ctx.lineWidth = 0.5;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.stroke();
        return canvas;
    }

    // convert strength to km/h
    function strengthToKmh(strength, unit) {
        if (unit == 'km/h') {
            return strength;
        } else if (unit == 'kt') {
            return strength * 1.852;
        } else if (unit == 'm/s') {
            return strength * 18 / 5;
        }
    }

    let windPattern = /(\d+)°\/(\d+)/; // 275°/33
    let thermalHeights = [];

    function applyArrows() {

        for (let span of document.querySelectorAll('span.product-title-txt')) {

            // use usable height for the yellow height markers
            if (span.innerText.match(/^(Arbeitshöhe|Usable height|Altitude utilisable)/)) {
                let tr = span.parentElement.parentElement;
                let tds = Array.from(tr.querySelectorAll('td'));
                let tdCount = tds.length - 1;

                for (let [i, td] of tds.slice(1, tdCount + 1).entries()) {
                    thermalHeights[i] = parseInt(td.innerText);
                }
            }

            // overwrite with cumulus base if there are clouds
            if (span.innerText.match(/^(Cumulus Basis|Cumulus base|Base Cumulus)/)) {
                let tr = span.parentElement.parentElement;
                let tds = Array.from(tr.querySelectorAll('td'));
                let tdCount = tds.length - 1;

                for (let [i, td] of tds.slice(1, tdCount + 1).entries()) {
                    let cloudBaseHeight = parseInt(td.innerText);
                    if (cloudBaseHeight) thermalHeights[i] = cloudBaseHeight;
                }
            }

            let match = null;

            if (match = span.innerText.match(/(?:Wind|Vent)\s+(\d+).+\[(.+)\]/)) { // Wind 2600m ISA [km/h]
                let [, windHeight, unit] = match;

                let tr = span.parentElement.parentElement;
                let tds = Array.from(tr.querySelectorAll('td'));
                let tdCount = tds.length - 1;

                // iterate over the td's, ignore the first one with text
                for (let [i, td] of tds.slice(1, tdCount + 1).entries()) {

                    let tdText = td.innerText.trim();
                    let [, angle, strength] = windPattern.exec(tdText);

                    angle = parseInt(angle);
                    let strengthKmh = strengthToKmh(parseInt(strength), unit);

                    let canvas = document.createElement('canvas');
                    canvas.width = canvasWidth * scale;
                    canvas.height = canvasHeight * scale;
                    canvas.title = `${angle}°`;

                    let ctx = canvas.getContext('2d');


                    let arrowCanvas = drawArrow(arrowSize * scale, angle, strengthKmh);

                    if (scale != 1) {
                        ctx.scale(scale, scale);
                    }

                    ctx.drawImage(arrowCanvas, 0, 0);

                    // wind strength
                    ctx.font = '12px Arial, Helvetica, sans-serif';
                    ctx.strokeStyle = 'rgba(255, 255, 255, 1)';
                    ctx.lineWidth = 4;
                    ctx.textAlign = 'right';
                    ctx.strokeText(strength, canvasWidth, 20);
                    ctx.fillStyle = 'rgba(0, 0, 0, 1)';
                    ctx.fillText(strength, canvasWidth, 20);

                    // replace the irritating text content with our shiny new arrows
                    let tdSpan = td.querySelector('span');

                    canvas.style.width = `${canvasWidth}px`;
                    canvas.style.height = `${canvasHeight}px`;

                    if (windHeight <= thermalHeights[i]) {
                        canvas.style.backgroundColor = usableHeightBackgroundColor;
                    }

                    let oldArrow = td.querySelector('canvas');

                    // Hide the old span with text so that the next Ajax request still can find and modify it.
                    tdSpan.style.overflow = 'hidden';
                    tdSpan.style.width = '0px';
                    tdSpan.style.height = '0px';

                    if (oldArrow) { // replace the old arrow on next draws
                        td.replaceChild(canvas, oldArrow);
                    } else {  // first draw, just append
                        td.appendChild(canvas);
                    }

                }

            }

        }

    }

    let config = {
        childList: true,
        subtree: true
    }

    let observedTarget = document.querySelector('div#forecast-table table.responsive');

    let observer = new MutationObserver(function (mutations, observer_) {
        // something changed in the table!

        // because we mutate the table ourselves, first stop the observer
        observer_.disconnect();

        // draw our pretty arrows
        applyArrows();

        // and resume observing
        observer.observe(observedTarget, config);
    });

    observer.observe(observedTarget, config);

    // no Ajax on first load, just parse the page
    applyArrows();
}
