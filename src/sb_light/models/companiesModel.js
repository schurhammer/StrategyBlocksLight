
/*globals define */

define(['sb_light/models/_abstractModel','sb_light/globals'], function( _Model, sb ) {
	'use strict';

	var E;

	var Model = _Model.extend({
		
		init: function() {

			this._authStateCheck = this._authStateCheck || sb.state.authorized;
			this._super("companies", sb.urls.MODEL_COMPANIES);
		}
	});	
	return Model;
});
