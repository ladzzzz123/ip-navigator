// -*- coding: utf-8 -*-
// (c) 2014 Andreas Motl, Elmyra UG

// Foundation
require('backbone.marionette');
require('bootstrap-2.3.2/css/bootstrap.css');
require('bootstrap-2.3.2/css/bootstrap-responsive.css');
require('patzilla.lib.bs3_list_group');

require('jquery.shorten.1.0');
require('keyboarder/keyboarder.js');
require('keyboarder/keyboarder.css');
require('patzilla.navigator.style');

// Patches to make the old Backbone Marionette 1.1.0 work with Webpack
Backbone.$   = window.jQuery;
Marionette.$ = window.jQuery;


// Main
NavigatorHelp = Backbone.Marionette.Application.extend({
});

navigatorHelp = new NavigatorHelp({});

navigatorHelp.addRegions({
    region_hotkeys: "#help-hotkeys-region",
});

navigatorHelp.addInitializer(function(options) {
});

require('../components/hotkeys/hotkeys-help.js');

$(document).ready(function() {
    console.log("document.ready");
    navigatorHelp.start();
});