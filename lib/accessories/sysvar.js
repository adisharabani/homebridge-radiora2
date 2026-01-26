let Characteristic, Service;

module.exports = class Sysvar {

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
            .getService(Service.Switch)
            .getCharacteristic(Characteristic.On)
            .on('set', this.setPower.bind(this));
    
/*        this.accessory
            .getService(Service.Switch)
            .getCharacteristic(Characteristic.On)
            .updateValue(true);
*/

        this.radiora2.on("sysvar", function(varId, value) {
            // Is this for us?
            if (varId == this.config.id) {
                this.log.debug(value, this.config.name);
                // On
                this.accessory
                    .getService(Service.Switch)
                    .getCharacteristic(Characteristic.On)
                    .updateValue(value!=0);
            }
        }.bind(this));

        this.radiora2.on("on", function (integrationId) {
            // Is this for us?
            if (integrationId == this.config.id) {
                this.log.debug("Turned ON", this.config.name);
                // On
                this.accessory
                    .getService(Service.Switch)
                    .getCharacteristic(Characteristic.On)
                    .updateValue(true);
            }
        }.bind(this));

        // Turned Off
        this.radiora2.on("off", function (integrationId) {
            // Is this for us?
            if (integrationId == this.config.id) {
                this.log.debug("Turned OFF", this.config.name);
                // On
                this.accessory
                    .getService(Service.Switch)
                    .getCharacteristic(Characteristic.On)
                    .updateValue(false);
            }
        }.bind(this));

        // Request State
        this.radiora2.querySysVarState(this.config.id);

    }


    setPower(powerOn, callback) {
        if (powerOn){
            //this.radiora2.setSwitch(this.config.id, 100);
            this.radiora2.sendCommand("#SYSVAR,"+this.config.id+",1,1");
        }
        else {
            //this.radiora2.setSwitch(this.config.id, 0)
            this.radiora2.sendCommand("#SYSVAR,"+this.config.id+",1,0");
        }
        callback(null);
    }

}
