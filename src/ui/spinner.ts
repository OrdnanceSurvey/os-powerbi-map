// based on Leaflet.Spin https://github.com/makinacorpus/Leaflet.Spin?tab=readme-ov-file
// Re-implemented here as it isn't typescript so is hard to get it working with typescript 
// checking as it augments L.map

import L from "leaflet";
import * as Spinner from "spin.js";

const spinMixIn = {
    spin: function (state, options) {
        if (!!state) {
            // start spinning !
            if (!this._spinner) {
                this._spinner = new Spinner(options)
                    //@ts-ignore
                    .spin(this._container);
                this._spinning = 0;
            }
            this._spinning++;
        }
        else {
            this._spinning--;
            if (this._spinning <= 0) {
                // end spinning !
                if (this._spinner) {
                    this._spinner.stop();
                    this._spinner = null;
                }
            }
        }
    }
};
const SpinMapInitHook = function () {
    this.on('layeradd', function (e) {
        // If added layer is currently loading, spin !
        if (e.layer.loading) this.spin(true);
        if (typeof e.layer.on !== 'function') return;
        e.layer.on('data:loading', function () {
            this.spin(true);
        }, this);
        e.layer.on('data:loaded',  function () {
            this.spin(false);
        }, this);
    }, this);
    this.on('layerremove', function (e) {
        // Clean-up
        if (e.layer.loading) this.spin(false);
        if (typeof e.layer.on !== 'function') return;
        e.layer.off('data:loaded');
        e.layer.off('data:loading');
    }, this);
};
L.Map.include(spinMixIn);
L.Map.addInitHook(SpinMapInitHook);
