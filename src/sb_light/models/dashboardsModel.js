
/*globals define */

define(['sb_light/models/_abstractModel','sb_light/globals'], function( _Model, sb ) {
	'use strict';

	var E;
	var Model = _Model.extend({

		init: function() {
			E = sb.ext;
		
			this._super("dashboards", sb.urls.MODEL_DASHBOARDS);
		},


		_massageUpdatedModel: function() {
			this._super();

			E.each(this._model, function(d) {
				d.title_lower = E.lower(d.title);
				d.updated_recently = E.daysDiff(E.todayMoment(), E.parseUnixDate(d.updated_at)) < 7;
				d.updated_today = E.daysDiff(E.todayMoment(), E.parseUnixDate(d.updated_at)) < 2;
				E.each(d.widgets, function(w) {
					w.id = w.id || E.unique("widget");
				})
			});

		}		


	});	
	return Model;
});
