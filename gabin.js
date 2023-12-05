const { InstanceBase, Regex, runEntrypoint } = require('@companion-module/base')
const UpgradeScripts = require('./upgrades')
var osc = require('osc');

class OSCInstance extends InstanceBase {
	constructor(internal) {
		super(internal)
	}

	async init(config) {
		this.config = config;

		this.updateStatus('ok');

		this.updateActions();

		this.init_variable();

		this.init_osc();

	}

	/**
	 * Subscribe to Gabin state
	 */
	registerToGabin() {
		var path = "/register/shot"; 

		this.sendOscMessage(path, [
			{
				type: 's',
				value: this.config.feedbackHost,
			},
			{
				type: 's',
				value: this.config.feedbackPort,
			},
			{
				type: 's',
				value: "/feedback-shot",
			}
		]);

		path = "/register/autocam"; 
		this.sendOscMessage(path, [
			{
				type: 's',
				value: this.config.feedbackHost,
			},
			{
				type: 's',
				value: this.config.feedbackPort,
			},
			{
				type: 's',
				value: "/feedback-autocam",
			}
		]);

		path = "/register/defaultProfile"; 
		this.sendOscMessage(path, [
			{
				type: 's',
				value: this.config.feedbackHost,
			},
			{
				type: 's',
				value: this.config.feedbackPort,
			},
			{
				type: 's',
				value: "/feedback-profile",
			}
		]);
	}

	init_osc () {

		//Init. OSC to return state from Gabin to companion to update button colors and variables.
		if (this.connecting) {
			this.log('info', 'Already connecting..');
			return;
		}

		this.log('info', 'Connecting to Gabin');

		this.oscUdp = new osc.UDPPort({
			localAddress: this.config.feedbackHost,
			localPort: this.config.feedbackPort,
			address: this.config.host,
			port: this.config.port,
			metadata: true,
		})

		this.connecting = true
		this.log('info', 'opening')
		this.oscUdp.open()
		this.log('info', 'open')

		// setup callbacks
		this.registerToGabin();

		this.oscUdp.on('error', (err) => {
			this.log('error', 'Error: ' + err.message)
			console.log('error', 'Error: ' + err.message)
			this.connecting = false
			this.updateStatus(ConnectionFailure, "Can't connect to Gabin")
			if (err.code == 'ECONNREFUSED') {
				this.qSocket.removeAllListeners()
				console.log('error', 'ECONNREFUSED')
			}
		})

		this.oscUdp.on('close', () => {
			console.log('debug', 'Connection to Gabin Closed')
			this.connecting = false
			this.updateStatus(ConnectionFailure,'closed')
		})

		this.oscUdp.on('ready', () => {
			this.connecting = false
			this.log('info', 'Connected to Gabin:' + this.config.host)
			console.log('info', 'Connected to Gabin:' + this.config.host)

			this.updateStatus('ok')
		})

		this.oscUdp.on('message', (message) => {

			console.log('=> Callbacks');
			console.log(message);

			if (message.address == "/feedback-gabin-is-ready") {
				console.log("Update is ready value");
				if (message.args[0]['value'] == "true"){
					this.setVariableValues({'GabinIsReady': true});
				}else{
					this.setVariableValues({'GabinIsReady': false});
				}
			}

			if (message.address == '/feedback-shot'){
				this.setVariableValues({
					'GabinCurrentShot': message.args[0]['value']
				});
			}

			if (message.address == '/feedback-autocam'){
				this.setVariableValues({
					'GabinAutocam': message.args[0]['value']
				});
			}

		});
	}

	// When module gets deleted
	async destroy() {
		this.log('debug', 'destroy')
	}

	async configUpdated(config) {
		this.config = config
	}

	// Return config fields for web config
	getConfigFields() {
		return [
			{
				type: 'textinput',
				id: 'host',
				label: 'Target IP',
				width: 8,
				regex: Regex.IP,
				'default': '127.0.0.1'
			},
			{
				type: 'textinput',
				id: 'port',
				label: 'Target Port',
				width: 4,
				regex: Regex.PORT,
				'default': '32123'
			},
            {
				type: 'textinput',
				id: 'feedbackHost',
                label: 'Feedback IP (This module)',
				width: 8,
				regex: Regex.IP,
				'default': '127.0.0.1'
			},
			{
				type: 'textinput',
				id: 'feedbackPort',
                label: 'Feedback Port',
				width: 4,
				regex: Regex.PORT,
				'default': '32124'
			}
		]
	}

	sendOscMessage = (path, args) => {
		this.log('debug', `Sending OSC ${this.config.host}:${this.config.port} ${path}`)
		this.log('debug', `Sending Args ${JSON.stringify(args)}`)
		this.oscSend(this.config.host, this.config.port, path, args)
	}

	sendOscGetReadyStatus () {
		var path = "/gabin/is-ready"; 
		this.sendOscMessage(path, [
			{
				type: 's',
				value: this.config.feedbackHost,
			},
			{
				type: 's',
				value: this.config.feedbackPort,
			},
			{
				type: 's',
				value: "/feedback-gabin-is-ready",
			}
		]);
	}

	/**
	 * Set module actions
	 */
	updateActions() {
		var sendOscMessage = this.sendOscMessage; 
		var self = this;

		this.setActionDefinitions({
			gabin_register: {
				name: 'Subscribe to Gabin state',
				options: [],
				callback: async (event) => {
					self.registerToGabin();
				}
			},
			gabin_on: {
				name: 'Start Gabin',
				options: [],
				callback: async (event) => {
					var path = "/gabin/on"; 
					self.sendOscMessage(path, []);
					self.registerToGabin();
					self.sendOscGetReadyStatus();

					// TODO Update when Gabin have more internal state reporting capabilities
					// Today, it suspect that autocam is on, but it's wrong.
					self.setVariableValues({
						'GabinAutocam': "true"
					});
	
				}
			},
			gabin_off: {
				name: 'Stop Gabin',
				options: [],
				callback: async (event) => {
					var path = "/gabin/off"; 
					sendOscMessage(path, []);
				}
			},
			gabin_scene: {
				name: 'Send current scene to Gabin',
				options: [
					{
						type: 'textinput',
						label: 'Name of your scene',
						id: 'scene',
						default: 'NAME_OF_YOUR_SCENE',
						useVariables: true,
					},
				],
				callback: async (event) => {
					const scene = await this.parseVariablesInString(event.options.scene)
					var path = "/scene/"+scene; 
					self.sendOscMessage(path, []);
				}
			},
			gabin_source: {
				name: 'Trigger a specific shot',
				options: [
					{
						type: 'textinput',
						label: 'Name of your source',
						id: 'source',
						default: 'NAME_OF_YOUR_SOURCE',
						useVariables: true,
					},
				],
				callback: async (event) => {
					const source = await this.parseVariablesInString(event.options.source);
					var path = "/source/"+source;
					self.sendOscMessage(path, []);
				}
			},
			gabin_mic: {
				name: 'Toggle mic availability',
				options: [
					{
						type: 'textinput',
						label: 'Name of your mic',
						id: 'mic',
						default: 'NAME_OF_YOUR_MIC',
						useVariables: true,
					},
					{
						type: 'textinput',
						label: 'State (1 or 0 or variable)',
						id: 'state',
						default: '0',
						useVariables: true,
					}
				],
				callback: async (event) => {
					const mic = await this.parseVariablesInString(event.options.mic);
					const state = await this.parseVariablesInString(event.options.state);
					var path = "/mic/"+mic; 
					self.sendOscMessage(path, [
						{
							type: 'i',
							value: parseInt(state),
						},
					]);
				}
			},
			gabin_autocam: {
				name: 'Toggle autocam',
				options: [
					{
						type: 'textinput',
						label: 'State : 1 (ON) or 0 (OFF) or variable)',
						id: 'state',
						default: '0',
						useVariables: true,
					}
				],
				callback: async (event) => {
					const state = await this.parseVariablesInString(event.options.state);
					var path = "/autocam";  
					self.sendOscMessage(path, [
						{
							type: 'i',
							value: parseInt(state),
						},
					]);
				}
			},
			gabin_update_is_ready: {
				name: 'Update is-ready value',
				options: [],
				callback: async (event) => {
					self.sendOscGetReadyStatus();
				}
			}
			/*,
			send_blank: {
				name: 'Send message without arguments',
				options: [
					{
						type: 'textinput',
						label: 'OSC Path',
						id: 'path',
						default: '/osc/path',
						useVariables: true,
					},
				],
				callback: async (event) => {
					const path = await this.parseVariablesInString(event.options.path)

					sendOscMessage(path, [])
				},
			},
			send_int: {
				name: 'Send integer',
				options: [
					{
						type: 'textinput',
						label: 'OSC Path',
						id: 'path',
						default: '/osc/path',
						useVariables: true,
					},
					{
						type: 'textinput',
						label: 'Value',
						id: 'int',
						default: 1,
						regex: Regex.SIGNED_NUMBER,
						useVariables: true,
					},
				],
				callback: async (event) => {
					const path = await this.parseVariablesInString(event.options.path)
					const int = await this.parseVariablesInString(event.options.int)

					sendOscMessage(path, [
						{
							type: 'i',
							value: parseInt(int),
						},
					])
				},
			},
			send_float: {
				name: 'Send float',
				options: [
					{
						type: 'textinput',
						label: 'OSC Path',
						id: 'path',
						default: '/osc/path',
						useVariables: true,
					},
					{
						type: 'textinput',
						label: 'Value',
						id: 'float',
						default: 1,
						regex: Regex.SIGNED_FLOAT,
						useVariables: true,
					},
				],
				callback: async (event) => {
					const path = await this.parseVariablesInString(event.options.path)
					const float = await this.parseVariablesInString(event.options.float)

					sendOscMessage(path, [
						{
							type: 'f',
							value: parseFloat(float),
						},
					])
				},
			},
			send_string: {
				name: 'Send string',
				options: [
					{
						type: 'textinput',
						label: 'OSC Path',
						id: 'path',
						default: '/osc/path',
						useVariables: true,
					},
					{
						type: 'textinput',
						label: 'Value',
						id: 'string',
						default: 'text',
						useVariables: true,
					},
				],
				callback: async (event) => {
					const path = await this.parseVariablesInString(event.options.path)
					const string = await this.parseVariablesInString(event.options.string)

					sendOscMessage(path, [
						{
							type: 's',
							value: '' + string,
						},
					])
				},
			},
			send_multiple: {
				name: 'Send message with multiple arguments',
				options: [
					{
						type: 'textinput',
						label: 'OSC Path',
						id: 'path',
						default: '/osc/path',
						useVariables: true,
					},
					{
						type: 'textinput',
						label: 'Arguments',
						id: 'arguments',
						default: '1 "test" 2.5',
						useVariables: true,
					},
				],
				callback: async (event) => {
					const path = await this.parseVariablesInString(event.options.path)
					const argsStr = await this.parseVariablesInString(event.options.arguments)

					const rawArgs = (argsStr + '').replace(/“/g, '"').replace(/”/g, '"').split(' ')

					if (rawArgs.length) {
						const args = []
						for (let i = 0; i < rawArgs.length; i++) {
							if (rawArgs[i].length == 0) continue
							if (isNaN(rawArgs[i])) {
								let str = rawArgs[i]
								if (str.startsWith('"')) {
									//a quoted string..
									while (!rawArgs[i].endsWith('"')) {
										i++
										str += ' ' + rawArgs[i]
									}
								} else if(str.startsWith('{')) {
									//Probably a JSON object
									try {
										args.push((JSON.parse(rawArgs[i])))
									} catch (error) {
										this.log('error', `not a JSON object ${rawArgs[i]}`)
									}
								}

								args.push({
									type: 's',
									value: str.replace(/"/g, '').replace(/'/g, ''),
								})
							} else if (rawArgs[i].indexOf('.') > -1) {
								args.push({
									type: 'f',
									value: parseFloat(rawArgs[i]),
								})
							} else {
								args.push({
									type: 'i',
									value: parseInt(rawArgs[i]),
								})
							}
						}

						sendOscMessage(path, args)
					}
				},
			},
			send_boolean: {
				name: 'Send boolean',
				options: [
					{
						type: 'static-text',
						label: 'Attention',
						value: 'The boolean type is non-standard and may only work with some receivers.',
						id: 'warning'
					},
					{
						type: 'textinput',
						label: 'OSC Path',
						id: 'path',
						default: '/osc/path',
						useVariables: true,
					},
					{
						type: 'checkbox',
						label: 'Value',
						id: 'value',
						default: false,
					},
				],
				callback: async (event) => {
					const path = await this.parseVariablesInString(event.options.path)
					let type = 'F'
					if (event.options.value === true) {
						type = 'T'
					}

					sendOscMessage(path, [
						{
							type,
						},
					])
				},
			},
			*/
		})
	}

	init_variable (){
		const variables = [];
		variables.push({variableId: 'GabinIsReady', name: 'Gabin Is Ready'});
		variables.push({variableId: 'GabinCurrentShot', name: 'Gabin Current Shot'});		
		variables.push({variableId: 'GabinAutocam', name: 'Gabin last state'});		

		this.setVariableDefinitions(variables);

		this.setVariableValues({
            'GabinIsReady': '',
			'GabinCurrentShot': '',
			'GabinAutocam': ''
		});
	}

}

runEntrypoint(OSCInstance, UpgradeScripts)
