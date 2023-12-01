# Companion Gabin Connection module

Fully based on companion-module-generic-osc, I own no copyright on neither companion nor gabin, nor the companion-module-generic-osc code

Gabin can be piloted from the osc generic module, but this module add feedbacks and convenient functions

**Available commands for Gabin**

- Start (important, will force Gabin to forward internal state)
- Stop
- Send current scene to Gabin
- Trigger a specific shot
- Toggle mic availability
- Update GabinIsReady value

**Available Variables**

The module have to call Gabin register's functions.
This is done on startup and under the start action

- GabinIsReady : Updated when Update action is triggered
- GabinCurrentShot : received from /register/shot
- GabinAutocam : received from /register/autocam
