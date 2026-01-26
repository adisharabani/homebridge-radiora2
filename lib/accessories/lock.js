let Characteristic, Service;

module.exports = class Lock {

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
            .getService(Service.LockMechanism) 
            .getCharacteristic(Characteristic.LockTargetState) 
            .on('set', this.setPower.bind(this)); 

        // Lock
        this.accessory
            .getService(Service.LockMechanism)
            .getCharacteristic(Characteristic.LockCurrentState)
            .updateValue(Characteristic.LockCurrentState.SECURED);
        this.accessory
            .getService(Service.LockMechanism)
            .getCharacteristic(Characteristic.LockTargetState)
            .updateValue(Characteristic.LockTargetState.SECURED);

        // Turned On
        this.radiora2.on("on", function (integrationId) {
            // Is this for us?
            if (integrationId == this.config.id) {
                this.log.debug("Turned ON", this.config.name);
                // On
                this.accessory
                    .getService(Service.LockMechanism)
                    .getCharacteristic(Characteristic.LockTargetState)
                    .updateValue(Characteristic.LockTargetState.UNSECURED);
                this.accessory
                    .getService(Service.LockMechanism)
                    .getCharacteristic(Characteristic.LockCurrentState)
                    .updateValue(Characteristic.LockCurrentState.UNSECURED);
                if (this.config.offtimer) {
                    this.log.info("new timer");
                    this.offtimer = setTimeout(function() {
                        this.setPower(Characteristic.LockTargetState.SECURED, function(x) {});
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
                    .getService(Service.LockMechanism)
                    .getCharacteristic(Characteristic.LockTargetState)
                    .updateValue(Characteristic.LockTargetState.SECURED);
                this.accessory
                    .getService(Service.LockMechanism)
                    .getCharacteristic(Characteristic.LockCurrentState)
                    .updateValue(Characteristic.LockCurrentState.SECURED);
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
        if (powerOn == Characteristic.LockCurrentState.UNSECURED ){
            this.radiora2.setSwitch(this.config.id, 100);
        }
        else {
            this.radiora2.setSwitch(this.config.id, 0)
        }
        callback(null);
    }

}
        

