let Characteristic, Service;
const DELTA_MS = 100;

module.exports = class GarageDoorOpener {

    constructor(log, config, accessory, radiora2, homebridge, storage) {
        Characteristic = homebridge.hap.Characteristic;
        Service = homebridge.hap.Service;
        this.accessory = accessory;
        this.log = log;
        this.radiora2 = radiora2;
        this.config = config;
        this.keypadData = this.config.keypadHookData ? this.config.keypadHookData.replace(/[^\d,;]/g,"").split(";").map((x)=>x.split(",").map(parseFloat)) : []
	
        this.storage = storage;
        this.storage.getItem('level-'+this.config.id).then(level => {this.level = level || 0}).catch(err=> {this.level=0}).finally(()=> {
               this.stopSimulatedDimmer(false)
        });
        
        this.accessory
            .getService(Service.AccessoryInformation)
                .setCharacteristic(Characteristic.Manufacturer, "Lutron")
                .setCharacteristic(Characteristic.Model, this.config.model)
                .setCharacteristic(Characteristic.SerialNumber, this.config.serial);
        this.setupListeners();
        this.movementTimer;
    }

    setupListeners() {
        // Target Position
        this.accessory
            .getService(Service.GarageDoorOpener)
            .getCharacteristic(Characteristic.TargetDoorState)
            .on('set', this.setTargetDoorState.bind(this));


/*
        // Closed
        this.radiora2.on("off", function (integrationId) {
            // Is this for us?
            if (integrationId == this.config.id) {
                this.log.debug("Closed", this.config.name);
                this.accessory
                    .getService(Service.GarageDoorOpener)
                    .getCharacteristic(Characteristic.TargetDoorState)
                    .updateValue(Characteristic.TargetDoorState.CLOSED);
                if (this.movementTimer) {
                    clearTimeout(this.movementTimer);
                }
                this.movementTimer = setTimeout(() => {
                    this.accessory
                        .getService(Service.GarageDoorOpener)
                        .getCharacteristic(Characteristic.CurrentDoorState)
                        .updateValue(Characteristic.CurrentDoorState.CLOSED);
                }, 1000);
                
            }
        }.bind(this));

        // Level
        this.radiora2.on("level", function (integrationId, level) {
            // Is this for us?
            if (integrationId == this.config.id) {
                if (this.config.estimatedTime !== undefined) return;
                this.log.debug("Set to " + level + "%", this.config.name);
                this.accessory
                    .getService(Service.GarageDoorOpener)
                    .getCharacteristic(Characteristic.TargetPosition)
                    .updateValue(level);
                if (this.movementTimer) {
                    clearTimeout(this.movementTimer);
                }

                this.movementTimer = setTimeout(() => {
                    this.accessory
                        .getService(Service.GarageDoorOpener)
                        .getCharacteristic(Characteristic.CurrentPosition)
                        .updateValue(level);
                }, 1000);
            }
        }.bind(this));

        // done moving
        this.radiora2.on("moving", function (integrationId, state) {
            // Is this for us?
            if (integrationId == this.config.id) {
                if (this.movementTimer) {
                    clearTimeout(this.movementTimer);
                }
                if (state == 0) {
                    this.log.debug("Moving up", this.config.name);
                    this.accessory
                        .getService(Service.GarageDoorOpener)
                        .getCharacteristic(Characteristic.TargetDoorState)
                        .updateValue(Characteristic.TargetDoorState.OPEN);
                    this.accessory
                        .getService(Service.GarageDoorOpener)
                        .getCharacteristic(Characteristic.CurrentDoorState)
                        .updateValue(Characteristic.CurrentDoorState.OPENING);
                } else if (state == 1) {
                    this.log.debug("Moving down", this.config.name);
                    this.accessory
                        .getService(Service.GarageDoorOpener)
                        .getCharacteristic(Characteristic.TargetDoorState)
                        .updateValue(Characteristic.PositionState.CLOSE);
                    this.accessory
                        .getService(Service.GarageDoorOpener)
                        .getCharacteristic(Characteristic.CurrentDoorState)
                        .updateValue(Characteristic.CurrentDoorState.CLOSING);
                } else if (state == 2) {
                    this.log.debug("Finished moving", this.config.name);
                    this.accessory
                        .getService(Service.GarageDoorOpener)
                        .getCharacteristic(Characteristic.CurrentDoorState)
                        .updateValue(Characteristic.PositionState.STOPPED);
                    this.log.debug("Consider setting current door state according to level")
                    //this.accessory
                    //    .getService(Service.GarageDoorOpener)
                   //     .getCharacteristic(Characteristic.CurrentDoorState)
                    //    .updateValue(this.accessory.getService(Service.GarageDoorOpener).getCharacteristic(Characteristic.TargetPosition).value);
                    
                }
            }
        }.bind(this));
*/

        this.accessory
            .getService(Service.GarageDoorOpener)
            .getCharacteristic(Characteristic.ObstructionDetected)
            .updateValue(false);

        // Request State
        this.radiora2.queryOutputState(this.config.id);

	// Control covers via keypads
        this.radiora2.on("buttonAction", function(integrationId, buttonId, action) {
	    // Is this for us?
            if (action == 3 && this.keypadData.some(([keypad,lower,raise])=>integrationId==keypad && buttonId == raise)) {
                this.log.info("   --->   3up")
                if (this.direction == 2) {
                    this.stopSimulatedDimmer(true)
	        } else {
                    this.setSimulatedDimmer(100, true);
                }
            } else if (action == 3 && this.keypadData.some(([keypad,lower,raise])=>integrationId==keypad && buttonId == lower)) {
                this.log.info("   --->   3down")
                if (this.direction == 3) {
                    this.stopSimulatedDimmer(true)
                } else {
                    this.setSimulatedDimmer(0,true);
                }
            } else if (action == 4 && this.keypadData.some(([keypad,lower,raise])=>integrationId==keypad && (buttonId == lower || buttonId == raise))) {
		    // handle key-up 
            }
        }.bind(this));
    }

    setTargetDoorState(state, callback) {
        setTimeout(function() {
            if (this.config.estimatedTime !== undefined) {
                this.setSimulatedDimmer(state == Characteristic.TargetDoorState.CLOSED ? 0 : 100, true);
            } else {
                this.radiora2.setDimmer(this.config.id, state == Characteristic.TargetDoorState.CLOSED ? 0 : 100);
            }
        }.bind(this),100);
        callback(null);
    }

    stopSimulatedDimmer(control_motors) {
        this.log.info("Stopping simulated dimmer");
        this.direction = 0;
        const isOpen = this.level == 100;
        const isClosed = this.level == 0;
        clearInterval(this.estimator);
        if (control_motors) {
            this.estimator = setTimeout(()=>this.radiora2.stopMoving(this.config.id), isOpen || isClosed ? this.config.estimatedTime * 1000 : 10);
        }
        this.accessory
                    .getService(Service.GarageDoorOpener)
                    .getCharacteristic(Characteristic.CurrentDoorState)
                    .updateValue(isOpen ? Characteristic.CurrentDoorState.OPEN : isClosed ? Characteristic.CurrentDoorState.CLOSED : Characteristic.CurrentDoorState.STOPPED);
        this.accessory
                    .getService(Service.GarageDoorOpener)
                    .getCharacteristic(Characteristic.TargetDoorState)
                    .updateValue(isOpen ? Characteristic.TargetDoorState.OPEN : isClosed ? Characteristic.TargetDoorState.CLOSED : Characteristic.TargetDoorState.STOPPED);
        this.storage.setItem('level-'+this.config.id, this.level); 
    }

    setSimulatedDimmer(target_level, control_motors) {
        this.log.debug("set Simulated Dimmer: level " + this.level + "->" + target_level)
        if (target_level !== undefined) this.target_level = target_level;
        if (this.target_level === undefined) this.target_level = this.level;

	// Timing variables
        const delta_ms = 100;
        const delta = 100 / (this.config.estimatedTime / (delta_ms / 1000.0));

        // Find direction
        var direction = target_level == 0 ? 3 : 2;
        /*
            direction = 2 // Open
            direction = 3 // Close
        */
        this.accessory
            .getService(Service.GarageDoorOpener)
            .getCharacteristic(Characteristic.CurrentDoorState)
            .updateValue(target_level == 0 ? Characteristic.CurrentDoorState.CLOSING : Characteristic.CurrentDoorState.OPENING);
        
        clearInterval(this.estimator)
        var skip = Math.round(400/delta_ms); 
	this.direction = direction;
        if (this.direction && control_motors) {
            this.radiora2.setOutput(this.config.id, this.direction); 
        }

        //this.log.info("TARGET: " + this.target_level);

        this.iteration_index = 0;
        this.estimator = setInterval(() => {
	    this.iteration_index++;
            this.log.debug("ESTIMATOR [" +this.iteration_index +"] " + this.level);
            if (skip-- > 0) return; // skip to simulate delayed motor
            const level_diff = this.target_level - this.level;
            const direction = Math.sign(level_diff);

            if (Math.abs(level_diff) > delta) {
                // estimate change in level
                this.level += direction * delta;
            } else {
                if (this.level != this.target_level) {
                    this.level = this.target_level;
                    this.storage.setItem('level-'+this.config.id, this.level); 
                }

                this.log.info("Level Set: " + this.level);
                this.stopSimulatedDimmer(control_motors);
            }
       }, delta_ms);
    }


}
