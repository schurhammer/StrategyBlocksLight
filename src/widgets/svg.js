

define(['widgets/widget'], function( W ) {

	'use strict';

	var SVG = W.extend({


		_d3:null,
		_pd3:null,
		_svgDiv:null, // placeholder div for the SVG element so we can absolutely position it properly
		_children:null,
		_rootElement: null,

		//d3 custom events
		_dispatcher:null,

		_width:null,
		_height:null,
		_left:null,
		_top:null,

		//do not override
		init:function(sb, parent, def, rootElement) {
			if(!d3) {
				throw "You need to load the d3.js library to use SVG widgets";
			}
			this._rootElement = rootElement || (sb.ext.isStr(def.widget) ? def.widget : "svg");

			Object.defineProperties(this, {
				"d3": 		{get: function() { this._d3; }},
				"pd3": 		{get: function() { this._pd3; }},
			});

			this._super(sb, parent, def);
		},

		create:function() {
			this._name = this._name || (this._rootElement + " " + this.id);
			this._children = {};
			this._dispatches = this._dispatches || {};

			this._pd3 = d3.select(this.parentDom);
			this._d3 = this.createDom(this._def);

			this._dom = this._d3.node();

			this.createChildren(this.childrenLayout());
		},

		postCreate:function() {

			//create a dispatcher if we've got dispatches
			var dk = this._sb.ext.keys(this._def.dispatches);
			if(dk.length) {
				this._dispatcher = d3.dispatch.apply(d3, dk);
			}
			this._super();
		},


		_propertyOverrides: function() {
			var po = this._super();
			var self = this;
			po["default"] = this.bind("attr");
			po.style = this.bind("css");
			po.dispatches = this.bind("dispatches");

			this._sb.ext.mixin(po, [
				"stroke", "stroke-width", "stroke-linecap", "stroke-opacity", "stroke-linejoin", "stroke-dasharray",
				"fill", "fill-opacity",	"text-anchor"
			].reduce(function(prev,el) {
				prev[el] = self.bind("style");
				return prev;
			}, {}));

			this._sb.ext.mixin(po, ["left", "top", "width", "height"].reduce(function(prev,el) {
				prev[el] = self.bind("prop");
				return prev;
			}, {}));

			return po;
		},

		childrenLayout: function() {
			return null;
		},

		createChildren: function(childrenDef) {
			try {
				var d,i;
				childrenDef = this._sb.ext.isArr(childrenDef) ? childrenDef : (childrenDef ? [childrenDef] : []);
				for( i = 0; i < childrenDef.length; ++i) {
					d = childrenDef[i];
					d.id = this._sb.layout.uniqueId(d);
					this._children[d.id] = this._sb.ext.isString(d.widget) ? (new SVG(this._sb, this.dom, d)) : (new d.widget(this._sb, this.dom, d));
					if(d.children) {
						this._children[d.id].createChildren(d.children);
					}
				}
			} catch(e) {
				throw ["SB_Light::SVG::create ", e.message, d.id].join(" -- ");
			}
		},
		child: function(id) {
			return this._children[id] || this._children[this.cid(id)] || null;
		},

		appendChild: function(c) {		},

		createDom:function(opts) {
			if(!opts.widget) { throw "The \'widget\' option must be specified, and be the name of a valid HTML element."; }
			if(this._rootElement == "svg" && !this.parentDom.ownerSVGElement) {
				this._svgDiv  = this.pd3.append("div").attr("class", "sb_light_widget");
			}
			return (this._svgDiv || this.pd3.append(this._rootElement));
		},



		//d3 functions--------------------------------------------------
		attr: function() {
			return this.d3.attr.apply(this._d3, arguments);
		},
		style:function() {
			return this.d3.style.apply(this._d3, arguments);
		},
		css:function() {
			if(this._svgDiv){
				return this.cssText.apply(this, arguments);
			} else {
				return this.style.apply(this, arguments);
			}
		},
		text: function() {
			var t = this._sb.ext.slice(arguments, arguments.length == 2 ? 1 : 0);
			return this.d3.text.apply(this.d3, t);
		},

		className: function() {
			var args = this._sb.ext.slice(arguments, (arguments[0] == "class" || arguments[0] == "className") ? 1 : 0 );
			var d3 = this._svgDiv || this._d3;
			if(args.length) {
				var classes = args[0].split(/\s/);
				classes.forEach(function(c) {
					d3.classed(c, args[1] !== true );
				});
				return this;
			}
			return d3.attr("class");
		},


		//add function handlers for d3 dispatching
		dispatches:function(/*"dispatches", {name:func}*/) {
			var args = this._sb.ext.slice(arguments, arguments.length == 2 ? 1 : 0);
			if(args.length) {
				var n, list = args[0];
				for(n in list) {
					this._dispatcher.on(n, list[n]);
				}
				return this;
			}
			return this._dispatches;
		},


		dispatch: function(name, context, data, index) {
			if(this._dispatcher && this._dispatcher[name]) {
				//call d3 style where "this" is normally the dom element from the original event,
				this._dispatcher[name].apply(context, [data,index]);
			}
		},

		dispatcher: function() {
			return this._dispatcher;
		},

		dims: function(left,top,width, height) {
			this.dim("left", left);
			this.dim("top", top);
			this.dim("width", width);
			this.dim("height", height);

			this.invalidate();
		},

		dim: function(name, value) {
			if(name.match(/left|top|width|height/)) {
				this.prop.apply(this, this._sb.ext.slice(arguments));
			}
			if(this._svgDiv) {
				//for root svg which sits under a layout parsed DOM
				if(arguments.length > 1) {
					this._svgDiv.style(name,  this._sb.ext.px(value));
					if(name.match(/width|height/)) {
						this.d3.attr(name,  value);
					}
					return this;
				}
			} else {
				//use the d3 methods instead
				if(arguments.length > 1) {
					this.d3.attr(name, value);
					return this;
				}
			}
			return this.prop(name);
		},


		rect:function() {
			return this._super();
		}

	});

	return SVG;

});