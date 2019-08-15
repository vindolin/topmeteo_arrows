// ==UserScript==
// @name         Topmeteo Arrows
// @namespace    http://tampermonkey.net/
// @version      0.7.0
// @description  Add Meteo-Parapente style arrows to the table!
// @author       Thomas Schüßler
// @match        https://*.topmeteo.eu/*/*/loc/*
// @grant        none
// ==/UserScript==

{
    'use strict';

    function map(num, in_min, in_max, out_min, out_max) {
      return (num - in_min) * (out_max - out_min) / (in_max - in_min) + out_min;
    }

    const usable_height_background_color ='#FFFFAA';
    const hsl_start = 0;
    const hsl_end = 183; // 183 = green
    const min_strength = 0;
    const max_strength = 40; // km/h

    const arrow_size = 20;
    const canvas_width = 37;
    const canvas_height = 20;

    // relative to size
    const min_arrow_head_width = 3.0;
    const max_arrow_head_width = 7.0;

    // only upscale
    const scale = window.devicePixelRatio > 1 ? window.devicePixelRatio : 1;

    function draw_arrow(size, angle, strength) {
        let canvas = document.createElement('canvas');

        let hue = hsl_end - map(strength, min_strength, max_strength, hsl_start, hsl_end);
        let color = `hsl(${hue}, 100%, 45%)`;

        if(strength >= max_strength) {
            color = `hsl(${hsl_end - hsl_end}, 100%, 45%)`;
        }

        let ctx = canvas.getContext('2d');

        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = strength / 4;

        // limit arrow width to be smaller than the arrow head
        if(ctx.lineWidth > max_strength / 3) ctx.lineWidth = max_strength / 3;

        // rotate around center
        ctx.translate(size / 2, size / 2);
        let angle_rad = angle * Math.PI / 180;
        ctx.rotate(angle_rad);
        ctx.translate(- size / 2, - size / 2);

        ctx.moveTo(size / 2, 0);
        ctx.lineTo(size / 2, size - size / 3);
        ctx.stroke();

        let arrow_head_width = map(strength, min_strength, max_strength, min_arrow_head_width, max_arrow_head_width);

        // draw arrow head
        ctx.beginPath();
        ctx.moveTo(size / 2, size);
        ctx.lineTo(size / arrow_head_width, size - size / 2.5);
        ctx.lineTo(size - size / arrow_head_width, size - size / 2.5);
        ctx.fill();

        return canvas;
    }

    // convert strength to km/h
    function strength_to_kmh(strength, unit) {
        if(unit == 'km/h') {
            return strength;
        } else if(unit == 'kt') {
            return strength / 0.53995680345572;
        } else if(unit == 'm/s') {
            return strength * 18 / 5;
        }
    }

    let wind_pattern = /(\d+)°\/(\d+)/; // 275°/33
    let thermal_heights = [];

    function apply_arrows() {

        for(let span of document.querySelectorAll('span.product-title-txt')) {

            // use usable height for the yellow height markers
            if(span.innerText.match(/^(Arbeitshöhe|Usable height|Altitude utilisable)/)) {
                let tr = span.parentElement.parentElement;
                let tds = Array.from(tr.querySelectorAll('td'));
                let td_count = tds.length - 1;

                for(let [i, td] of tds.slice(1, td_count + 1).entries()) {
                    thermal_heights[i] = parseInt(td.innerText);
                }
            }

            // overwrite with cumulus base if there are clouds
            if(span.innerText.match(/^(Cumulus Basis|Cumulus base|Base Cumulus)/)) {
                let tr = span.parentElement.parentElement;
                let tds = Array.from(tr.querySelectorAll('td'));
                let td_count = tds.length - 1;

                for(let [i, td] of tds.slice(1, td_count + 1).entries()) {
                    let cloud_base = parseInt(td.innerText);
                    if(cloud_base) thermal_heights[i] = cloud_base;
                }
            }

            let match = null;

            if(match = span.innerText.match(/(?:Wind|Vent)\s+(\d+).+\[(.+)\]/)) { // Wind 2600m ISA [km/h]
                let [, wind_height, unit] = match;

                let tr = span.parentElement.parentElement;
                let tds = Array.from(tr.querySelectorAll('td'));
                let td_count = tds.length - 1;

                // iterate over the td's, ignore the first one with text
                for(let [i, td] of tds.slice(1, td_count + 1).entries()) {

                    let td_text = td.innerText.trim();
                    let [, angle, strength] = wind_pattern.exec(td_text);

                    angle = parseInt(angle);
                    let strength_kmh = strength_to_kmh(parseInt(strength), unit);

                    let canvas = document.createElement('canvas');
                    canvas.width = canvas_width * scale;
                    canvas.height = canvas_height * scale;
                    canvas.title = `${angle}°`;

                    let ctx = canvas.getContext('2d');


                    let arrow_canvas = draw_arrow(arrow_size * scale, angle, strength_kmh);

                    ctx.drawImage(arrow_canvas, 0, 0);

                    if(scale != 1) {
                        ctx.scale(scale, scale);
                    }

                    // wind strength
                    ctx.font = '12px Arial, Helvetica, sans-serif';
                    ctx.strokeStyle = 'rgba(255, 255, 255, 1)';
                    ctx.lineWidth = 4;
                    ctx.textAlign = 'right';
                    ctx.strokeText(strength, canvas_width, 20);
                    ctx.fillStyle = 'rgba(0, 0, 0, 1)';
                    ctx.fillText(strength, canvas_width, 20);

                    // replace the irritating text content with our shiny new arrows
                    let td_span = td.querySelector('span');

                    canvas.style.width = `${canvas_width}px`;
                    canvas.style.height = `${canvas_height}px`;

                    if(wind_height <= thermal_heights[i]) {
                        canvas.style.backgroundColor = usable_height_background_color;
                    }

                    let old_arrow = td.querySelector('canvas');

                    // Hide the old span with text so that the next Ajax request still can find and modify it.
                    td_span.style.overflow = 'hidden';
                    td_span.style.width = '0px';
                    td_span.style.height = '0px';

                    if(old_arrow) { // replace the old arrow on next draws
                        td.replaceChild(canvas, old_arrow);
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

    let observed_target = document.querySelector('div#forecast-table table.responsive');

    let observer = new MutationObserver(function(mutations, observer_) {
        // something changed in the table!

        // because we mutate the table ourselve, first stop the observer
        observer_.disconnect();

        // draw our pretty arrows
        apply_arrows();

        // and resume observing
        observer.observe(observed_target, config);
    });

    observer.observe(observed_target, config);

    // no Ajax on first load, just parse the page
    apply_arrows();
}
