
/* globals define, $, d3, require */
'use strict';

define([
	'sb_light/utils/Class', 
	"sb_light/main",
	//no args
	"d3",
	"jquery.tooltipster"
], function( Class, sb ) {
	

	var E, ST, M, STR;
	var DOM_REGISTER = {};
	var OPTS = {
		appendTo: 		null,
		idKey:			null,
		stateFunction: 	"any",
		typeName:		"Dom"
	};

	var Dom = Class.extend({

		__opts:null,
		__id:null,
		__binds:null,
		__children:null,
		__watchers:null,
		__models:null,
		__skipModels:null,
		__data:null,
		__parsers:null,
		__root:null,
		__created:false,
		__dirty: false,
		__busy:false,
		__delay:0,
		__canDrawDelay:-1,
		__beforeDrawList:null,
		__beforeDrawWaiting:"",
		__beforeDrawFunctions: null,
		__postBeforeDrawFunctions: null,
		__modelDirty:"dirty",
		__typeName:"Dom",
		__differences:null,



		//do not override
		init:function(opts) {
			this.sb = sb;
			E = sb.ext;
			ST = sb.state;
			STR = sb.strings;
			M = sb.models;
			var o = this.__opts = this.initOpts(opts);

			this.__root = o.appendTo || o.root || "body";
			this.__age = E.time();

						//set inside the options take priority
			this.__id = o.id || 
						//next use a different property in the options
						(o.idKey && o[o.idKey]) || 
						//next try the DOM element itself
						$(this.__root).attr("id") || 
						//next just make one up							
						("dom_widget_" + E.unique())
			;
			// console.log("ID", this.__id, o.id, o.idKey, this.__root, $(this.__root).attr("id"), OPTS, this.__opts);

			if(!DOM_REGISTER[this.__id]) {
				DOM_REGISTER[this.__id] = this;
				$(this.__root).attr("id", this.__id);

				sb.queue.buffer(Dom.cleanup, "DOM_CLEANUP_REGISTRY", 500);
				// console.log("Adding to the DOM", E.length(DOM_REGISTER));
			} else {
				throw new Error("DOM Widget with the same id already exists " + this.__id);
			}


			//children dom widgets that were parsed
			this.__children = [];
			//children dom widgets that were parsed
			this.__creatingChildren = {};

			//children dom widgets that were parsed
			this.__binds = {};

			//parsers for data-* properties on the loaded HTML
			this.__parsers = {};

			//used to watch for sb.state properties easily
			this.__watchers = {
				"state":{},
				"context":{},
				"cookie": {},
				"data":{}
			};

			//used to watch  sb.models 
			this.__models = {};

			this.__data = {};

			this.__beforeDrawList = [];
			this.__beforeDrawFunctions = [];
			this.__postBeforeDrawFunctions = ["postCreate"];

			Object.defineProperties(this, {
				//jQuery 
				"$": 			{get: function() { 	return $(this.__root); 			}},
				//DOM
				"dom": 			{get: function() { 	return this.$.get(0); 			}},
				//D3 selection
				"sel": 			{get: function() { 	return d3.select(this.dom); 	}},
				"id": 			{get: function() { 	return this.__id; 	}},
				"delay": 		{set: function(x) { this.__delay = x; }},
				"busy": 		{set: function(x) { this.__busy = x; }},
				"modelDirty": 	{set: function(x) { this.__modelDirty = x; }},
				"typeName":		{get: function() { return this.__opts.typeName; }}

			});


			
			this.cleanup();
			this.create();
		},

		//override this for startup stuff
		//this._super() should be called last generally
		create: function() {
			this.addParser("require", this.createChildren.bind(this));


			//override any opts we have based on HTML data properties
			var d = this.$.data();
			var opts = this.__opts;
			E.each(d, function(v,k) {
				if(opts.hasOwnProperty(k)) { 
					opts[k] = v; 
				}
			});


			//if there's an HTML template
			if(this.__opts.templatePath) {
				// console.log("Template", this.id, this.__opts.templatePath);
				this.addBeforeDraw("loadTemplate");
				this.addBeforeDraw("parseChildren");
				this.addBeforeDraw("loadTooltips");
			}

			this.__created = true;

			this.dirty();

			// console.log("create", this.id);
		},



		//This function is called after creation when "canDraw" is true, but postCreate hasn't been called yet.
		//it generally signals the loading of the html templates
		postCreate:function(cb) {

			//on devices, we want to open HTML links in a new system browser window
			if(sb.options.isDevice) {
				this.$.find("a[target='_blank']").on("click", function() {
					var href = $(this).attr("href");
					if(href.match(/^\//)) {
						href = sb.state.host + href;
					}
					// console.log("Open external browser");
					window.open(href, "_system");
					return false;
				});
			}
			//FIX IMAGES
			sb.helpers.fixImages(this.$);

			if(cb) {
				cb();
			} else {
				// console.log("wtf?");
				throw new Error("Please pass the 'cb' callback when overriding the postCreate function", this.id);
			}
		},

		destroy: function() {
			this.cleanup();

			if(DOM_REGISTER[this.__id]) {
				delete DOM_REGISTER[this.__id];
			}

			var w = this.__watchers;
			var ms = sb.models;
			var m = this.__models;

			//NEEDS DOING or events go wonky. 
			sb.queue.cancel("_buffer" + this.id);

			//unsubscribe from states
			E.each(w, function(type) {
				var list = w[type];
				E.each(list,function(v) {
					ST.unwatch(type, w[type], v);
				});
			});

			// this.__data = null;

			//unsubscribe from models
			E.each(m, function(ref,k) {
				ms.unsubscribe(k, ref);
			});

			//empty the child dom
			this.$.html("");

			//unset all __* variables. 
			E.each(this, function(v,k) {
				if(k.match(/^__/)) {
					this[k] = null;
				}
			});

			this.__binds = {};
		},

		queue: function(func, delay) {
			if(!func) { return; }

			delay = E.first(delay, this.delay, 0);
			sb.queue.buffer(func, "_buffer" + this.id,delay, true);
		},
	


		//MUST CALL this.beforeDrawDone() when this function has completed.
		addBeforeDraw: function(f) {
			//can be a function or a string. String is called this[f](), func is called f();
			this.__beforeDrawFunctions.punique(f);
			this._rebuildBeforeDrawList();
		},

		_rebuildBeforeDrawList: function() {
			this.__beforeDrawFunctions = this.__beforeDrawFunctions || [];
			this.__beforeDrawList = this.__beforeDrawFunctions.concat(this.__postBeforeDrawFunctions);
		},






		addDifferenceCheck: function(name, func) {
			this.__differences = this.__differences || {};
			this.__differences[name] = {cache:null, func:func};
		},

		hasDifferences: function() {
			if(!this.__differences) { return true;}

			return E._.some(this.__differences, function(v) {
				var res = v.func();	
				var diff = v.cache != res;
				// if(diff) {
				// 	console.log("HAS DIFFERENCE", k, res, v.cache);
				// }
				return diff;
			});


		},

		//which models this widget subscribes to
		models: function(/*string list...*/) {
			var args = E.slice(arguments, 0);
			var ms = this.__models;
			args.forEach(function(v) {
				if(!ms[v]) {
					ms[v] = ["TODO", v];
				}
			});
		},

	

		skipModels: function(/*string list*/) {
			var args = E.slice(arguments, 0);
			this.__skipModels = (this.__skipModels || []).concat(args);
			//add the models to watch, even though we skip them
			this.models.apply(this, args);
		},

		//watch a list of state properties
		watch: function(funcName, type /*, string list*/) {
			var self = this;
			var args = E.slice(arguments, 2);
			var ss = this.__watchers[type];
			if(!ss) {
				// self._consoleLogPages("DOM:WATCH", type, this.id, ss);
			}
			var df = this.bind(funcName);
			args.forEach(function(v) {
				var name = v+"_"+funcName; 
				if(ss[name]) { 
					sb.ext.warn("DOM::Watch:You are already watching this " +  v + " " +  type + " " + self.id);
					return;
				}
				ss[name] = ST.watch(type, v, function() {
					// self._consoleLogPages("HANDLE ", funcName, type, v, self.id);
					df();
				});
			});
		},

		//id(String), data (Array|Object, optional), isDataObject(Bool, optional)
		//case: (id): return the data part of the data object for the id.
		//case: (id, true) return the full data object 
		//case: (id, data) set the data part of the object, return "this"
		data: function(id, opt) {
			var full = E.isBool(opt) ? opt : false; 
			var d = (!E.isBool(opt) && opt) || null;
			if(d) {
				this.__data[id].data  = d;
				return this;
			}
			return full ? this.__data[id] : this.__data[id].data;
		},

		//specify options/ urls/ etc.., for the data required to draw
		requireData:function(opts) {
			if(!opts.id ) {
				throw new Error("DOM::RequireData is missing an id.", this.id, "Root: ", this.root, opts.url); 
			} else if (this.__data[opts.id]) {
				throw new Error("DOM::RequireData has already defined that data item.", this.id, "Root: ", this.root, opts.id); 
			}

			opts =E.merge({
				state:sb.state.authorized,
				data:null,
				busy:false,
				// id:"audits",
				//url: sb.urls.ADMIN_AUDITS,
				collect:E.fidentity({}), //function for generating arugments for the data fetching, default just returns an empty object
			}, opts);
			this.__data[opts.id] = opts;
		},

		stateValid:function() {
			if(!this.__opts) { return; }
			//everything needs a state function. The default is "all" which allows any state
			var sf = this.__opts && this.__opts.stateFunction;
			sf = sf ? ST[sf] : null;
			if(!sf ) {
				throw new Error("DOM:Error (id:"  + this.id + ") has no defined stateFunction.");
			}
			return sf();
		},

		modelsValid: function() {
			var sm = this.__skipModels || [];
			var ms = sb.models;
			var df = E.isStr(this.__modelDirty) ? this.bind(this.__modelDirty) : this.__modelDirty;
			var models = this.__models;

			E._.each(models, function(v,k) {
				if( E.isArr(v) && v[0] == "TODO") {
					models[k] = ms.subscribe(v[1], df);
				}
			});

			//reverse intersection to filter out the skipped models
			//remaining keys are checked against sb.models for validity;
			var mk = E._.xor(sm, E.keys(this.__models));

			var valid= true;
			E.each(mk, function(v) {
				var m = ms.get(v);
				//"m.get" will force a fetch if it's not valid. 
				valid = valid && m && m.get() !== null;
			});
			return valid;
		},

		//create a context-bound function for handling events.
		//warning: this is purely convenience and won't be appropriate when you need to bind extra arguments
		bind: function(name) {
			if(!this || !this.__binds) {
				return null;
			}

			if(!this.__binds[name]) {
				if(!this[name]) {
					throw new Error("SB_Light Widget (" + name + ") is not a function of : " + this.id);
				}
				this.__binds[name] = this[name].bind(this);
			}
			return this.__binds[name];
		},


		//done first after init. This allows the caller and subclass to override / add properties
		initOpts: function(opts) {
			opts = E.merge(OPTS, opts);
			// console.log("*********************INIT", opts.id, opts.stateFunction);
			return opts;
		},


		//you can set the options here and provide a function to call after the option has been set. 
		opts: function(str, val, handlerFunc, force/*==false*/) {
			//destroyed (TIMING ISSUE)
			if(!this.__opts) { return; }


			if(arguments.length > 1 &&  this.__opts.hasOwnProperty(str)) {
				//don't trigger redraw unless things have changed.
				if(!E._.eq(this.__opts[str], val) || force === true) { 
					this.__opts[str] = val;
					if(handlerFunc) { 
						var f = E.isStr(handlerFunc) ? this.bind(handlerFunc) : handlerFunc;
						if(E.isFunc(f)) {
							f();
						}
					}
				}
				return this;
			}
			return this.__opts.hasOwnProperty(str) ? this.__opts[str] : null;
		},

		loadTemplate: function() {
			var self = this; 

			// this._consoleLogPages("DOM:LoadingTemplate", this.id, this.__opts.templatePath);

			var templateOpts = this.__opts.templatePath.split("#");
			var opts = [sb.options.templates, templateOpts[0], ".html"];
			if(templateOpts[1]) {
				opts.put(" #", templateOpts[1]);
			}
			var tname = "TEMPLATE_"+opts.join(""); 
			try {
				var t = ST.context(tname);
				if(t) {
					if(t === "waiting...") {
						this.addBeforeDraw("loadTemplate");
						self.beforeDrawDone.bindDelay(self, 50);
					}  else {
						this.$.html(t);
						self.beforeDrawDone.bindDelay(self, 200);
					}
				} else {
					ST.context(tname, "waiting...");

					$.get(opts.join(""))
						.done(function(data) {
							data = STR.parse(data);
							self.$.html(data);
							ST.context(tname, data);
							self.beforeDrawDone.bindDelay(self, 200)
						})
						.fail(function(xhr, textStatus) {
							E.warn("Error loading template", textStatus);
						})
					;
				}
			} catch(e) {
				E.warn("Error loading template", opts.join(""));
			}
		},

		addParser: function(k,func) {
			this.__parsers[k] = func;
		},

		parseChildren: function(node ,cb) {
			if(arguments.length == 1) {
				cb = node;
				node = null;
			}
			// this._consoleLogPages("DOM:parseChildren", this.id);
			//parse the resulting HTML for data-template elements.
			var cel = node || this.$;

			E.each(this.__parsers, function(func,k) {
				cel.find("[data-"+k+"]").each(function() {
					var el = $(this);
					func(el, el.data());
				});
			});
			this.beforeDrawDone();
		},

		loadTooltips: function() {
			var self = this;
			this.$.find(".tooltipster").each(function() {
				var el = $(this);
				var opts = {
					trigger:"click"
				};

				var contentFunc = el.data("tooltip-content"); 
				if(contentFunc && self[contentFunc]) {
					//wrap the HTML response in a jquery object: $()
					opts.content = $( (self.bind(contentFunc))(this) );
				} 

				el.tooltipster(opts);
			});
			this.$.find("[title]").each(function() {
				$(this).tooltipster();
			});

			this.beforeDrawDone();
		},

		createChildren:function(el, opts, redraw/*==true*/) {
			var self = this; 
			var c = this.__children;
			opts = E.merge(opts, {root:el});

			redraw = (arguments.length < 3) || (redraw !== false);

			var src = opts.require || el.data("require"); 
			el.data("require", null);
			el.removeAttr("data-require");
			delete opts.require;

			if(src) {
				var key  = src + "_" + E.unique(); 
				try {

					self.__creatingChildren[key] = true;
					require([src], function(El) {

						//no guarantee of order this happens
						if(El && self.__creatingChildren && self.__creatingChildren[key]) {
							c.push(new El(opts));
							delete self.__creatingChildren[key];
						} else {
							// console.log("FAILED CREATING CHILD: ", src);
						} 

						if(redraw) {
							self.dirty();
						}
					});
				} catch (e) {
					E.warn("Error Loading JS: ", key);
				}
			} else if (redraw) {
				this.dirty();
			}
		},

		findChild: function(dom) {
			if(E.isStr(dom)) {
				dom = this.$.find(dom).get(0);
			}
			return E._.find(this.__children, {dom:dom});
		},


		destroyChildren:function() {
			E.each(this.__children, function(c) {
				c.destroy();
			});
		},

		beforeDrawDone: function() {
			this.__beforeDrawWaiting = false;
			this.dirty();
		},

		dirty: function(delay) {
			delay = E.first(delay , this.__delay);
			//reset the delay
			this.__canDrawDelay = this.__canDrawDelay >= 0 ? E.max(50, E.first(delay, 0)) : -1;

			// this._consoleLogPages("DOM WIDGET dirtying: ", this.id);
			//queue drawing so we don't end up calling it repeatedly from different events

			this.queue(this.bind("_beforeDraw"), delay);
		},

		fetchData: function() {
			// this._consoleLogPages("DOM WIDGET START fetch data: ", this.id);

			// console.log("Fetch Data: ", this.id);
			var ctrl = this.sb.controller;
			var self = this;
			E.each(this.__data, function(d) {
				if(d && !d.busy && d.data === null) {
					d.busy = true;
					d.args = d.collect();

					//should be an empty object if paramters are not required.
					if (d.args === null) { return; }

					var f = self.handleData.bind(self, d.id);

					// self._consoleLogPages("DOM WIDGET fetch data: ", this.id, d.url, d.args, d.state());

					ctrl.fetch(d.url, d.args, f, f, d.state);				
				}
			});
		},

		clearData:function(id) {
			// console.log("Clear data: ", this.id, id);
			id = this.__data[id] ? id : null;
			if(id && this.__data[id]) {
				this.__data[id].data = null;
			} else if(!id) {
				E.each(this.__data, function(d) {
					d.data = null;
				});
			}
			this.dirty();
		},

		handleData: function(id, resp) {
			this.__data[id].busy = false;
			this.__data[id].data = resp ? (resp.result || resp ) : null;
			this.dirty();
		},

		needsData: function() {
			return E.reduce(this.__data, function(prev, curr) {
				return prev || curr.data === null;
			},false);
		},

		canDraw:function() {
			// this._consoleLogPages("DOM:CanDraw", this.id, this.__created, !this.__busy, this.modelsValid(), !this.needsData(), this.__beforeDrawList,  this.stateValid());			
			var cd = this.__created && !this.__busy && !this.__beforeDrawWaiting && !E.length(this.__creatingChildren) &&
					this.stateValid() && this.modelsValid() && !this.needsData();

			if(!cd &&  E.length(this.__creatingChildren)) {
				// console.log("CAN'T DRAW ", this.id, this.__creatingChildren, E.length(this.__creatingChildren));
			}		
			return cd;
		},

		//sanity before drawing
		_beforeDraw:function() {
			try {
				// this._consoleLogPages("DOM BEFORE DRAW:", this.id);

				if(this.canDraw()) {
					// this._consoleLogPages("DOM CAN DRAW:", this.id);
					if(this.__beforeDrawList.length) {
						this.__beforeDrawWaiting = true;
						var df = this.__beforeDrawList.shift();
						if(E.isStr(df)) {
							this[df].call(this, this.bind("_handleDoneBeforeDraw"));
						} else if (E.isFunc(df)) {
							df(this.bind("_handleDoneBeforeDraw"));
						} else {
							//not a valid function
							this._handleDoneBeforeDraw();
						}
					} else {
						if(this.hasDifferences()) {
							// this._consoleLogPages("DOM CAN DRAW MUTHER FARKER:", this.id);

							this.draw();
							//cache differences
							E.each(this.__differences, function(v) {
								v.cache = v.func();
							});

							//cancel any events that have been queued since we've drawn successfully
							// this._consoleLogPages("DOM CLEARING DRAW QUEUE:", this.id);
							sb.queue.cancel("_buffer" + this.id);
							// sb.queue.report();
						} else {
							// this._consoleLogPages("DOM CAN DRAW BUT NO DIFFERENCES:", this.id);
						}
					}
				} else { 
					if (this.needsData()) {
						// this._consoleLogPages("DOM NEEDS DATA:", this.id);

						this.fetchData();
						return;
					}
					if(this.__busy) {
						// this._consoleLogPages("DOM IS BUSY:", this.id);
						this.drawBusy();
					} else if (this.__creatingChildren) {
						//not sure what to do. I reckon wait...
					} else {
						//THIS IS INVALID -- REMOVE ALL ITEMS
						// this._consoleLogPages( ("CAN'T Draw? " + this.__dirty + " "), this.id, " created: ", this.__created, " busy: ",  this.__busy, 
						// 	" beforeDrawWaiting: ", this.__beforeDrawWaiting, " creating(len): ", E.length(this.__creatingChildren),
						// 	" modelvalid: ", this.modelsValid(), " needsdata: ", this.needsData(), " stateValid: ", this.stateValid()
						// );

						if(this.__dirty) {
							// this._consoleLogPages("DOM IS INVALID:", this.id);
							this.cleanup();
						}
						
						//if the delay is -1, we don't keep calling "dirty"
						if(this.__canDrawDelay >= 0) {
			//					console.log("Queueing " + this.id);
							this.__canDrawDelay = E.max(5000/*5 seconds*/,this.__canDrawDelay);
							
							// this._consoleLogPages("DOM IS BEING DIRTIED AGAIN:", this.id, this.__canDrawDelay);

							this.dirty(this.__canDrawDelay);
							// sb.queue.buffer(this._beforeDraw.bind(this), "_buffer" + this.id, this.__delay,);		
						} else {
							// this._consoleLogPages("DOM ELSE DO NOTHING", this.id);
						}
					}
				}
			} catch(e) {
				E.warn( "Error: exception thrown in " + this.id + "\n\n  " + e.stack);
				throw e;

			}
		},

		_handleDoneBeforeDraw: function() {
			this.__beforeDrawWaiting = false;
			this.dirty();
		},

		draw: function() {
			this.__dirty = true;

		},

		drawBusy: function() {

		},



		cleanup: function() {
			this.destroyChildren();

			this.sel.html("");

			E.each(this.__data, function(v,k) {
				v.data = null;
			});
			
			this._rebuildBeforeDrawList();
			this.__dirty = false;
		},

		_consoleLogPages: function(str, id) {
			var args = E.slice(arguments);
			if(id && id.match(/deleteProgress/)) {
				// console.log("ID", id)
				E.debug.apply(E, args);
			}
		}

	});

	Dom.domById = function(id) {
		return DOM_REGISTER[id] || null;
	}; 
	Dom.domByEl = function(el) {
		return Dom.domById(el.id);
	}; 
	Dom.cleanup = function() {
		var time = E.time();
		E.each(DOM_REGISTER, function(v) {
			var dom = v.dom;

			if (E.minutesDiff(time, v.__age) > 1 &&  !$.contains(document, dom)) {
 			   v.destroy();
 			   // this._consoleLogPages("DOM CLEANUP----REMOVED ", k, E.minutesDiff(time, dom.__age), E.length(DOM_REGISTER));
			}
		});
	};


	return Dom;

});