// ==UserScript==
// @name         Topmeteo Arrows
// @namespace    http://tampermonkey.net/
// @version      0.8.0
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

    // copied from https://stackoverflow.com/a/70049899
    class LinearGradientHelper {
        static WIDTH = 101; // 0..100
        static HEIGHT = 1;

        context = null;

        constructor(gradientColors) { // [ [color, % ie 0, 0.5, 1], [ ... ], ... ]
            // Canvas
            const canvas = document.createElement('canvas');
            canvas.width = LinearGradientHelper.WIDTH;
            canvas.height = LinearGradientHelper.HEIGHT;

            this.context = canvas.getContext("2d", { willReadFrequently: true });

            // Gradient
            const gradient = this.context.createLinearGradient(0, 0, LinearGradientHelper.WIDTH, 0); // x0, y0, x1, y1

            gradientColors.forEach(val => {
                gradient.addColorStop(val[1], val[0]);
            });

            // Fill with gradient
            this.context.fillStyle = gradient;
            this.context.fillRect(0, 0, LinearGradientHelper.WIDTH, LinearGradientHelper.HEIGHT); // x, y, width, height
        }

        getColor(percent) // percent [0..100]
        {
            const color = this.context.getImageData(parseInt(percent), 0, 1, 1); // x, y, width, height
            const rgba = color.data;

            return `rgb(${rgba[0]}, ${rgba[1]}, ${rgba[2]})`;
        }
    }

    const grad = new LinearGradientHelper([
        ['#00FFEAFF', 0],
        ['#00FF22FF', .2],
        ['#FFE602FF', .25],
        ['#FF0000FF', .5],
        ['#53005AFF', .6],
        ['#53005AFF', 1],
    ]);

    const canvasWidth = 50;
    const canvasHeight = 30;

    const usableHeightBackgroundColor = '#FFFFAA';

    const maxWindForColor = 100; // km/h

    const minWindForSizing = 2;
    const maxWindForSizing = 40; // km/h

    const arrowSize = 15;

    // relative to size
    const minArrowHeadWidth = 2.0;
    const maxArrowHeadWidth = 5.0;

    // only upscale
    const scale = window.devicePixelRatio > 1 ? window.devicePixelRatio : 1;

    function getArrowColor(strength) {
        return grad.getColor(Math.min(maxWindForColor, strength) / maxWindForColor * 100);
    }

    function drawArrow(size, angle, strength) {
        // angle = 0;
        // strength = 60;
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = getArrowColor(strength);

        ctx.translate(size / 2, size / 2);
        ctx.rotate(angle * Math.PI / 180);
        ctx.translate(-size / 2, -size / 2);

        const arrowHeadLength = map(strength, minWindForSizing, maxWindForSizing, size / 3, size / 2);
        const arrowHeadWidth = map(strength, minWindForSizing, maxWindForSizing, minArrowHeadWidth, maxArrowHeadWidth);
        const arrowTailWidth = (size / 4) * (strength / maxWindForSizing);
        const arrowTailLength = size - arrowHeadLength;

        // draw the arrow from top to bottom
        ctx.beginPath();

        ctx.moveTo(size / 2 - arrowTailWidth / 2, 0);
        ctx.lineTo(size / 2 + arrowTailWidth / 2, 0);
        ctx.lineTo(size / 2 + arrowTailWidth / 2, arrowTailLength);
        ctx.lineTo(size - size / arrowHeadWidth, size - arrowHeadLength);
        ctx.lineTo(size / 2, size);
        ctx.lineTo(size / arrowHeadWidth, size - arrowHeadLength);
        ctx.lineTo(size / 2 - arrowTailWidth / 2, arrowTailLength);

        ctx.closePath();

        // outline
        ctx.lineWidth = 0.5;
        ctx.strokeStyle = 'black';
        ctx.stroke();

        ctx.fill();

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

    const windPattern = /(\d+)°\/(\d+)/; // 275°/33
    let thermalHeights = [];

    function applyArrows() {

        for (const span of document.querySelectorAll('span.product-title-txt')) {

            // use usable height for the yellow height markers
            if (span.innerText.match(/^(Arbeitshöhe|Usable height|Altitude utilisable)/)) {
                const tr = span.parentElement.parentElement;
                const tds = Array.from(tr.querySelectorAll('td'));
                const tdCount = tds.length - 1;

                for (const [i, td] of tds.slice(1, tdCount + 1).entries()) {
                    thermalHeights[i] = parseInt(td.innerText);
                }
            }

            // overwrite with cumulus base if there are clouds
            if (span.innerText.match(/^(Cumulus Basis|Cumulus base|Base Cumulus)/)) {
                const tr = span.parentElement.parentElement;
                const tds = Array.from(tr.querySelectorAll('td'));
                const tdCount = tds.length - 1;

                for (const [i, td] of tds.slice(1, tdCount + 1).entries()) {
                    const cloudBaseHeight = parseInt(td.innerText);
                    if (cloudBaseHeight) thermalHeights[i] = cloudBaseHeight;
                }
            }

            let match;

            if (match = span.innerText.match(/(?:Wind|Vent)\s+(\d+).+\[(.+)\]/)) { // Wind 2600m ISA [km/h]
                const [, windHeight, unit] = match;

                const tr = span.parentElement.parentElement;
                const tds = Array.from(tr.querySelectorAll('td'));
                const tdCount = tds.length - 1;

                // iterate over the td's, ignore the first one with text
                for (const [i, td] of tds.slice(1, tdCount + 1).entries()) {

                    const tdText = td.innerText.trim();
                    let [, angle, strength] = windPattern.exec(tdText);

                    angle = parseInt(angle);
                    const strengthKmh = strengthToKmh(parseInt(strength), unit);

                    const canvas = document.createElement('canvas');
                    canvas.width = canvasWidth * scale;
                    canvas.height = canvasHeight * scale;
                    canvas.title = `${angle}°`;

                    const ctx = canvas.getContext('2d');


                    const arrowCanvas = drawArrow(arrowSize * scale, angle, strengthKmh);

                    if (scale != 1) {
                        ctx.scale(scale, scale);
                    }

                    ctx.drawImage(arrowCanvas, canvasWidth * 0.25, 0);

                    // wind strength
                    const textSize = 10;
                    const outlineWidth = 4;
                    ctx.font = `${textSize}px Arial, Helvetica, sans-serif`;
                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
                    ctx.lineWidth = outlineWidth;
                    ctx.textAlign = 'right';
                    const textY = canvasHeight / 2 + textSize / 2;
                    ctx.strokeText(strength, canvasWidth, textY);
                    ctx.fillStyle = 'rgba(0, 0, 0, 1)';
                    ctx.fillText(strength, canvasWidth, textY);

                    // replace the irritating text content with our shiny new arrows
                    const tdSpan = td.querySelector('span');

                    canvas.style.width = `${canvasWidth}px`;
                    canvas.style.height = `${canvasHeight}px`;

                    if (windHeight <= thermalHeights[i]) {
                        canvas.style.backgroundColor = usableHeightBackgroundColor;
                    }

                    const oldArrow = td.querySelector('canvas');

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

    const config = {
        childList: true,
        subtree: true
    }

    const observedTarget = document.querySelector('div#forecast-table table.responsive');

    const observer = new MutationObserver(function (mutations, observer_) {
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
