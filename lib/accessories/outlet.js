let Characteristic, Service;

module.exports = class Outlet {

    constructor(log, config, accessory, radiora2, homebridge) {
        Characteristic = homebridge.hap.Characteristic;
        Service = homebridge.hap.Service;
        this.accessory = accessory;
        this.log = log;
        this.radiora2 = radiora2;
        this.config = config;
        
        this.accessory
            .getService(Service.AccessoryInformation)
                .setCharacteristic(Characteristic.Manufacturer, "Lutron")
                .setCharacteristic(Characteristic.Model, this.config.model)
                .setCharacteristic(Characteristic.SerialNumber, this.config.serial);
        this.setupListeners();
    }

    setupListeners() {
        // Power
        this.accessory
            .getService(Service.Outlet)
            .getCharacteristic(Characteristic.On)
            .on('set', this.setPower.bind(this));
/*
        this.accessory
            .getService(Service.Outlet)
            .getCharacteristic(Characteristic.On)
            .updateValue(true);
*/
        this.accessory
            .getService(Service.Outlet)
            .getCharacteristic(Characteristic.OutletInUse)
            .updateValue(false);

        // Turned On
        this.radiora2.on("on", function (integrationId) {
            // Is this for us?
            if (integrationId == this.config.id) {
                this.log.debug("Turned ON", this.config.name);
                // On
                this.accessory
                    .getService(Service.Outlet)
                    .getCharacteristic(Characteristic.On)
                    .updateValue(true);
                if (this.config.offtimer) {
                    this.log.info("new timer");
                    this.offtimer = setTimeout(function() {
                        this.setPower(false, function(x) {});
                    }.bind(this),this.config.offtimer*1000) 
                }
            }
        }.bind(this));

        // Turned Off
        this.radiora2.on("off", function (integrationId) {
            // Is this for us?
            if (integrationId == this.config.id) {
                this.log.debug("Turned OFF", this.config.name);
                // On
                this.accessory
                    .getService(Service.Outlet)
                    .getCharacteristic(Characteristic.On)
                    .updateValue(false);
                if (this.config.offtimer && this.offtimer) {
                    this.log.info("Cancel Timer")
                    clearTimeout(this.offtimer);
                    this.offtimer = undefined;
                }
            }
        }.bind(this));

        // Request State
        this.radiora2.queryOutputState(this.config.id);

    }


    setPower(powerOn, callback) {
        if (powerOn){
            this.radiora2.setSwitch(this.config.id, 100);
        }
        else {
            this.radiora2.setSwitch(this.config.id, 0)
        }
        callback(null);
    }

}
