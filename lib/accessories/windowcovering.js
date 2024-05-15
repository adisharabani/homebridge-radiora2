let Characteristic, Service;
const DELTA_MS = 100;

module.exports = class WindowCovering {

    constructor(log, config, accessory, radiora2, homebridge, storage) {
        Characteristic = homebridge.hap.Characteristic;
        Service = homebridge.hap.Service;
        this.accessory = accessory;
        this.log = log;
        this.radiora2 = radiora2;
        this.config = config;
        this.keypadData = this.config.keypadHookData ? this.config.keypadHookData.replace(/[^\d,;]/g,"").split(";").map((x)=>x.split(",").map(parseFloat)) : []
        // Tilt     
        if (this.config.blind) {
            // Vertical
            if (this.config.tilt == "vertical") {
                this.currentTiltAngleCharacteristic = Characteristic.CurrentVerticalTiltAngle;
                this.targetTiltAngleCharacteristic = Characteristic.TargetVerticalTiltAngle;
            } else {
                this.currentTiltAngleCharacteristic = Characteristic.CurrentHorizontalTiltAngle;
                this.targetTiltAngleCharacteristic = Characteristic.TargetHorizontalTiltAngle;
            }
        }

        this.storage = storage;
        this.storage.getItem('level-'+this.config.id).then(level => {this.level = level || 0}).catch(err=> {this.level=0}).finally(()=> {
            this.storage.getItem('tilt-'+this.config.id).then(tilt => {this.tilt = tilt || 0}).catch(err=> {this.tilt=0}).finally(()=> {
               this.stopSimulatedDimmer(false)
            });
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
            .getService(Service.WindowCovering)
            .getCharacteristic(Characteristic.TargetPosition)
            .on('set', this.setTargetPosition.bind(this));

        // Hold Position
        this.accessory
            .getService(Service.WindowCovering)
            .getCharacteristic(Characteristic.HoldPosition)
            .on('set', this.setHoldPosition.bind(this));

        // Tilt
        if (this.config.blind) {
            this.accessory
               .getService(Service.WindowCovering)
               .getCharacteristic(this.targetTiltAngleCharacteristic)
               .on('set', this.setTargetTilt.bind(this));
        }

        // Closed
        this.radiora2.on("off", function (integrationId) {
            // Is this for us?
            if (integrationId == this.config.id) {
                this.log.debug("Closed", this.config.name);
                this.accessory
                    .getService(Service.WindowCovering)
                    .getCharacteristic(Characteristic.TargetPosition)
                    .updateValue(0);
                if (this.movementTimer) {
                    clearTimeout(this.movementTimer);
                }
                this.movementTimer = setTimeout(() => {
                    this.accessory
                        .getService(Service.WindowCovering)
                        .getCharacteristic(Characteristic.CurrentPosition)
                        .updateValue(0);
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
                    .getService(Service.WindowCovering)
                    .getCharacteristic(Characteristic.TargetPosition)
                    .updateValue(level);
                if (this.movementTimer) {
                    clearTimeout(this.movementTimer);
                }

                this.movementTimer = setTimeout(() => {
                    this.accessory
                        .getService(Service.WindowCovering)
                        .getCharacteristic(Characteristic.CurrentPosition)
                        .updateValue(level);
                }, 1000);
            }
        }.bind(this));

        // tilt
        this.radiora2.on("tilt", function (integrationId, level) {
            // Is this for us?
            if (integrationId == this.config.id) {
                if (this.config.blind) {
                    this.log.debug("Tilt set to " + level + "%", this.config.name);
                    this.accessory
                        .getService(Service.WindowCovering)
                        .getCharacteristic(this.currentTiltAngleCharacteristic)
                        .updateValue((level * 1.8) - 90);
                }
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
                        .getService(Service.WindowCovering)
                        .getCharacteristic(Characteristic.PositionState)
                        .updateValue(Characteristic.PositionState.INCREASING);
                } else if (state == 1) {
                    this.log.debug("Moving down", this.config.name);
                    this.accessory
                        .getService(Service.WindowCovering)
                        .getCharacteristic(Characteristic.PositionState)
                        .updateValue(Characteristic.PositionState.DECREASING);
                } else if (state == 2) {
                    this.log.debug("Finished moving", this.config.name);
                    this.accessory
                        .getService(Service.WindowCovering)
                        .getCharacteristic(Characteristic.PositionState)
                        .updateValue(Characteristic.PositionState.STOPPED);
                    this.accessory
                        .getService(Service.WindowCovering)
                        .getCharacteristic(Characteristic.CurrentPosition)
                        .updateValue(this.accessory.getService(Service.WindowCovering).getCharacteristic(Characteristic.TargetPosition).value);
                }
            }
        }.bind(this));

        this.accessory
            .getService(Service.WindowCovering)
            .getCharacteristic(Characteristic.PositionState)
            .updateValue(Characteristic.PositionState.STOPPED);

        // Request State
        this.radiora2.queryOutputState(this.config.id);
        if (this.config.blind) {
            this.radiora2.queryOutputTilt(this.config.id);
        }

        // Control covers via keypads
        this.radiora2.on("buttonAction", function(integrationId, buttonId, action) {
            // Is this for us?
            if (action == 3 && this.keypadData.some(([keypad,lower,raise])=>integrationId==keypad && buttonId == raise)) {
                this.log.debug("   --->   3up")
                if (this.direction == 2) {
                    this.stopSimulatedDimmer(true)
                } else {
                    this.setSimulatedDimmer(100, 100, true);
                }
            } else if (action == 3 && this.keypadData.some(([keypad,lower,raise])=>integrationId==keypad && buttonId == lower)) {
                this.log.debug("   --->   3down")
                if (this.direction == 3) {
                    this.stopSimulatedDimmer(true)
                } else {
                    this.setSimulatedDimmer(0,0,true);
                }
            } else if (action == 4 && this.keypadData.some(([keypad,lower,raise])=>integrationId==keypad && (buttonId == lower || buttonId == raise))) {
                    // handle jog latch
                    this.hold = false;
            }
        }.bind(this));
    }

    setTargetPosition(level, callback) {
        setTimeout(function() {
            if (this.config.estimatedTime !== undefined) {
                this.setSimulatedDimmer(level,undefined, true);
            } else {
                this.radiora2.setDimmer(this.config.id, level);
            }
        }.bind(this),100);
        callback(null);
    }

    stopSimulatedDimmer(control_motors) {
        this.log.debug("Stopping simulated dimmer");
        this.direction = 0;
        const isOpen = this.level == 100 && (!this.config.blind || this.tilt == 100);
        const isClosed = this.level == 0 && (!this.config.blind || this.tilt == 0);
        if (control_motors) {
            setTimeout(()=>this.radiora2.stopMoving(this.config.id), isOpen || isClosed ? 2000 : 10);
        }
        clearInterval(this.estimator);
        this.accessory
                    .getService(Service.WindowCovering)
                    .getCharacteristic(Characteristic.CurrentPosition)
                    .updateValue(this.level);
        this.accessory
                    .getService(Service.WindowCovering)
                    .getCharacteristic(Characteristic.TargetPosition)
                    .updateValue(this.level);
        this.storage.setItem('level-'+this.config.id, this.level); 
        if (this.config.blind) {
            this.accessory
                        .getService(Service.WindowCovering)
                        .getCharacteristic(this.currentTiltAngleCharacteristic)
                        .updateValue(this.tilt * 1.8 - 90);
            this.accessory
                        .getService(Service.WindowCovering)
                        .getCharacteristic(this.targetTiltAngleCharacteristic)
                        .updateValue(this.tilt * 1.8 - 90);
            this.storage.setItem('tilt-'+this.config.id, this.tilt); 
        }
        this.accessory
            .getService(Service.WindowCovering)
            .getCharacteristic(Characteristic.PositionState)
            .updateValue(Characteristic.PositionState.STOPPED);
    }

    setSimulatedDimmer(target_level, target_tilt, control_motors) {
        this.log.debug("set Simulated Dimmer: level " + this.level + "->" + target_level + ", tilt: "+ this.tilt + "->" + target_tilt)
        this.hold = true;
        if (target_level !== undefined) this.target_level = target_level;
        if (target_tilt !== undefined) this.target_tilt = target_tilt;
        if (this.target_level === undefined) this.target_level = this.level;

        // Timing variables
        const delta_ms = 100;
        const delta = 100 / (this.config.estimatedTime / (delta_ms / 1000.0));
        const delta_tilt = 100 / (1.7 / (delta_ms / 1000.0));
        var skip = 0

        // Find direction
        var direction = 0;
        if ((this.target_level !== undefined) && (this.target_level > this.level)) {
            direction = 2 // Open
        } else if ((this.target_level !== undefined) && (this.target_level < this.level)) {
            direction = 3 // Close
        } else if ((this.target_tilt !== undefined) && this.config.blind) {
            // Only change the tilt
            if (this.target_tilt > this.tilt) {
                direction = 2 // Open
            } else if (this.target_tilt < this.tilt) {
                direction = 3 // Close
            }
        }
        
        clearInterval(this.estimator)
        var skip = this.direction && direction != this.direction ? Math.round(400/delta_ms) : 0; 
        var jog = this.direction && direction != this.direction ? Math.round(1300/delta_ms) : Math.round(900/delta_ms); 
        this.direction = direction;
        if (this.direction && control_motors) {
            this.radiora2.setOutput(this.config.id, this.direction); 
        }

        //this.log.debug("TARGET: " + this.target_level + ";" + this.target_tilt);

        this.iteration_index = 0;
        this.estimator = setInterval(() => {
            this.iteration_index++;
            this.log.debug("ESTIMATOR [" +this.iteration_index +"] " + this.level + ";" + this.tilt);
            if (skip-- > 0) return; // skip to simulate delayed motor
            if (this.iteration_index == jog && !this.hold) {this.debug.info("JOG STOP");this.stopSimulatedDimmer(control_motors); return}
            const level_diff = this.target_level - this.level;
            const direction = Math.sign(level_diff);

            if (Math.abs(level_diff) > delta) {
                // First estimate change in tilt
                if (this.config.blind && (this.tilt != (direction > 0 ? 100 : 0) )) {
                    this.tilt = Math.min(Math.max(this.tilt + direction * delta_tilt , 0 ), 100);
                    if (this.tilt == (direction > 0 ? 100 : 0)) {
                       this.accessory
                        .getService(Service.WindowCovering)
                        .getCharacteristic(this.currentTiltAngleCharacteristic)
                        .updateValue(this.tilt * 1.8 - 90);
                       this.accessory
                        .getService(Service.WindowCovering)
                        .getCharacteristic(this.targetTiltAngleCharacteristic)
                        .updateValue(this.tilt * 1.8 - 90);
                           this.storage.setItem('tilt-'+this.config.id, this.tilt); 
                    }
                // Then estimate change in level
                } else {
                    this.level += direction * delta;
                }
            } else {
                if (this.level != this.target_level) {
                    this.level = this.target_level;
                    this.storage.setItem('level-'+this.config.id, this.level); 
                    if (this.config.blind && (this.target_tilt !== undefined) && (this.target_tilt != this.tilt)) {
                        this.log.debug("Reverting engine's direction to get to the right tilt");
                        this.direction = this.direction == 2 ? 3 : 2;
                        if (control_motors) this.radiora2.setOutput(this.config.id, this.direction); 
                        skip = 400/delta_ms;
                        return;
                    }
                }

                if (this.config.blind) {
                    if (this.target_tilt !== undefined) {
                        const tilt_diff = this.target_tilt - this.tilt;
                        if (Math.abs(tilt_diff) > delta_tilt) {
                            this.log.debug("tilt " + this.tilt)
                            this.tilt += Math.sign(tilt_diff) * delta_tilt;
                            return;
                        } else {
                            this.tilt = this.target_tilt;        
                            this.storage.setItem('tilt-'+this.config.id, this.tilt); 
                            this.log.debug("Tilt Set: " + this.tilt);
                            delete this.target_tilt;
                        }
                    }
                }
                this.log.debug("Level Set: " + this.level);
                this.stopSimulatedDimmer(control_motors);
            }
       }, delta_ms);
    }


    setHoldPosition(level, callback) {
        setTimeout(function() {
            this.log.debug("setHoldPosition");
            if (this.config.blind) {
                this.radiora2.stopLift(this.config.id);
                this.radiora2.stopTilt(this.config.id);
            } else {
                this.radiora2.stopMoving(this.config.id);
            }
        }.bind(this),100);
        callback(null);
    }

    setTargetTilt(level,callback) {
       if (this.config.tilt == "vertical") {
           this.setTargetVerticalTilt(level, callback);
       } else {
           this.setTargetHorizontalTilt(level, callback);
       }
    }

    setTargetHorizontalTilt(level, callback) {
        setTimeout(function() {
            this.radiora2.setTilt(this.config.id, (level + 90) / 1.8, false);
        }.bind(this),100);
        callback(null);
    }

    setTargetVerticalTilt(level, callback) {
        setTimeout(function() {
            if (this.config.estimatedTime !== undefined) {
               this.setSimulatedDimmer(undefined, (level + 90) / 1.8, true);
            } else {
               this.radiora2.setTilt(this.config.id, (level + 90) / 1.8, true);
            }
     
        }.bind(this),100);
        callback(null);
    }
}
