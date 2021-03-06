// -*- coding: utf-8 -*-
// (c) 2014-2017 Andreas Motl, Elmyra UG
require('select2/select2.js');
require('select2/select2.css');
require('jquery-caret-plugin/dist/jquery.caret.js');
var bootbox = require('bootbox');

require('patzilla.lib.radioplus');
var FIELDS_KNOWLEDGE = require('./expression-fields.js').FIELDS_KNOWLEDGE;

QueryBuilderView = Backbone.Marionette.ItemView.extend({

    template: require('./querybuilder.html'),

    initialize: function() {
        console.log('QueryBuilderView.initialize');
        //this.listenTo(this.model, "change", this.render);
        //this.listenTo(this, "item:rendered", this.setup_ui);
        this.config = this.templateHelpers.config = navigatorApp.config;
        //this.setup_ui();
        this.radios = new RadioPlus();
    },

    templateHelpers: {},

    onDomRefresh: function() {
        console.log('QueryBuilderView.onDomRefresh');
        this.setup_ui_base();
        this.setup_ui_actions();
    },

    setup_ui_base: function() {
        console.log('QueryBuilderView.setup_ui');

        var _this = this;


        // ------------------------------------------
        //   datasource selector
        // ------------------------------------------
        this.display_datasource_buttons();

        // switch cql field chooser when selecting datasource
        // TODO: do it properly on the configuration data model
        $('#datasource').on('click', '.btn', function(event) {
            var datasource = $(this).data('value');
            navigatorApp.set_datasource(datasource);

            // hide query textarea for ftpro, if not in debug mode
            _this.setup_ui_query_textarea();
        });



        // ------------------------------------------
        //   user interface flavor chooser
        // ------------------------------------------

        $('#querybuilder-flavor-chooser button[data-toggle="tab"]').on('shown', function (e) {

            //e.target // activated tab
            //e.relatedTarget // previous tab

            var flavor = $(e.target).data('value');
            if (!flavor) return;

            // transfer values back to regular comfort form
            _this.comfort_form_zoomed_to_regular_data();

            // show/hide cql field chooser
            _this.setup_cql_field_chooser(flavor != 'cql');

            // show all search backends
            _this.display_datasource_buttons();

            // application action: perform search
            // properly wire "send query" button
            $('.btn-query-perform').unbind('click');
            if (flavor == 'comfort') {

                _this.comfort_form_zoomed_to_regular_ui();

                // focus first field
                $('#patentnumber').focus();

                // hide action tools
                $('#querybuilder-comfort-actions').show();
                $('#querybuilder-cql-actions').hide();
                $('#querybuilder-numberlist-actions').hide();

                // hide history chooser
                $('#cql-history-chooser').show();

                // perform field-based search
                $('.btn-query-perform').click(function() {
                    $( "#querybuilder-comfort-form" ).submit();
                });

            } else if (flavor == 'cql') {

                // focus textarea
                $('#query').focus();

                // show action tools
                $('#querybuilder-comfort-actions').hide();
                $('#querybuilder-cql-actions').show();
                $('#querybuilder-numberlist-actions').hide();

                // show history chooser
                $('#cql-history-chooser').show();

                // show filter field
                if (navigatorApp.get_datasource() == 'ifi') {
                    $('#cql-filter-container').show();
                } else {
                    $('#cql-filter-container').hide();
                }

                // convert query from form fields to cql expression
                _this.compute_comfort_query();

                // perform cql expression search
                $('.btn-query-perform').click(function() {
                    var query_data = _this.get_common_form_data();
                    navigatorApp.disable_reviewmode();
                    navigatorApp.perform_search({
                        reviewmode: false,
                        flavor: flavor,
                        query_data: query_data,
                        reset: ['pagination_current_page', 'page_size'],
                    });
                });

                // hide query textarea for ftpro, if not in debug mode
                _this.setup_ui_query_textarea();


            } else if (flavor == 'numberlist') {

                // focus textarea
                $('#numberlist').focus();

                // hide action tools
                $('#querybuilder-comfort-actions').hide();
                $('#querybuilder-cql-actions').hide();
                $('#querybuilder-numberlist-actions').show();

                // hide history chooser
                $('#cql-history-chooser').hide();

                // switch datasource to epo
                navigatorApp.set_datasource('ops');

                // hide other search backends, only display OPS
                _this.display_datasource_buttons(['ops']);

                // perform numberlist search
                $('.btn-query-perform').click(function() {
                    navigatorApp.disable_reviewmode();
                    navigatorApp.populate_metadata();
                    navigatorApp.perform_numberlistsearch({reviewmode: false, reset: ['pagination_current_page', 'page_size']});
                });

            }
        });


        // ------------------------------------------
        //   common form behavior
        // ------------------------------------------

        //   mode: full-cycle, display all document kinds
        //   mode: remove patent family members

        // workaround for making "hasClass('active')" work stable
        // https://github.com/twbs/bootstrap/issues/2380#issuecomment-13981357
        var common_buttons = $('.btn-full-cycle, .btn-family-swap-ger, .btn-mode-order, .btn-family-remove, .btn-family-replace, .btn-family-full');
        common_buttons.unbind('click');
        common_buttons.on('click', function(e) {

            var already_active = $(this).hasClass('active');
            _this.radios.button_behaviour(this, e);

            // set label text
            _this.radios.label_behaviour(this, already_active);

            // when clicking a mode button which augments search behavior, recompute upstream query expression
            // for search backends where query_data modifiers already influence the expression building
            // with "ftpro", we inject the attribute 'fullfamily="true"' into the xml nodes
            if (navigatorApp.get_datasource() == 'ftpro') {
                _this.compute_comfort_query();
            }
        });


        // ------------------------------------------
        //   comfort form search
        // ------------------------------------------

        $( "#querybuilder-comfort-form" ).unbind();
        $( "#querybuilder-comfort-form" ).submit(function( event ) {

            // transfer values from zoomed fields
            _this.comfort_form_zoomed_to_regular_data();

            var query_data = _this.get_comfort_form_data();

            // convert query from form fields to cql expression
            _this.compute_comfort_query().then(function() {

                //$("#querybuilder-flavor-chooser button[data-flavor='cql']").tab('show');
                navigatorApp.disable_reviewmode();
                navigatorApp.perform_search({
                    reviewmode: false,
                    flavor: _this.get_flavor(),
                    query_data: query_data,
                    reset: ['pagination_current_page', 'page_size'],
                });

            });

        });

        // define default search action when using "Start search" button
        $('.btn-query-perform').unbind('click');
        $('.btn-query-perform').click(function() {
            $( "#querybuilder-comfort-form" ).submit();
        });


        // --------------------------------------------
        //   intercept and reformat clipboard content
        // --------------------------------------------
        /*
        $("#query").on("paste", function(e) {

            // only run interceptor if content of target element is empty
            if ($(this).val()) return;

            e.preventDefault();

            var text = (e.originalEvent || e).clipboardData.getData('text');

        });
        */

    },

    display_datasource_buttons: function(whitelist) {

        // At first, hide all buttons
        $('#datasource button').hide();

        // Then, compute data sources the user is allowed to see
        if (_.isEmpty(whitelist)) {
            whitelist = ['ops', 'depatisnet'];
            if (navigatorApp.config.get('google_enabled')) {
                whitelist.push('google');
            }
            if (navigatorApp.config.get('ftpro_enabled')) {
                //whitelist.push('ftpro');
            }
            if (navigatorApp.config.get('ifi_enabled')) {
                whitelist.push('ifi');
            }
            if (navigatorApp.config.get('depatech_enabled')) {
                whitelist.push('depatech');
            }
        }

        // Finally, activate buttons for allowed data sources
        _.each(whitelist, function(item) {
            $("#datasource > button[data-value='" + item + "']").show();
        });

    },

    // hide query textarea for ftpro, if not in debug mode
    setup_ui_query_textarea: function() {

        if (navigatorApp.config.get('debug')) {
            return;
        }

        if (navigatorApp.get_datasource() == 'ftpro') {
            $('#query').hide();
            $('#query').parent().find('#query-alert').remove();
            $('#query').parent().append('<div id="query-alert" class="alert alert-default span10" style="margin-left: 0px;">Expert mode not available for datasource "FulltextPRO".</div>');
            var alert_element = $('#query').parent().find('#query-alert');
            alert_element.height($('#query').height() - 18);
            //alert_element.marginBottom($('#query').marginBottom());
        } else {
            $('#query').parent().find('#query-alert').remove();
            $('#query').show();
        }

    },

    query_empty: function() {
        return _.isEmpty($('#query').val().trim());
    },
    check_query_empty: function(options) {
        if (this.query_empty()) {
            navigatorApp.ui.notify('Query expression is empty', {type: 'warning', icon: options.icon});
            return true;
        }
        return false;
    },

    numberlist_empty: function() {
        return _.isEmpty($('#numberlist').val().trim());
    },
    check_numberlist_empty: function(options) {
        if (this.numberlist_empty()) {
            navigatorApp.ui.notify('Numberlist is empty', {type: 'warning', icon: options.icon});
            return true;
        }
        return false;
    },

    get_comfort_form_entries: function(options) {
        options = options || {};
        var entries = [];
        _.each($('#querybuilder-comfort-form').find('input'), function(field) {
            var f = $(field);
            var name = f.attr('name');
            var value = f.val();
            if (!value && options.skip_empty) {
                return;
            }
            var label = name + ':';
            label = _.string.rpad(label, 16, ' ');
            entries.push(label + value);
        });
        return entries;
    },

    setup_ui_actions: function() {

        var _this = this;

        // ------------------------------------------
        //   cql query area action tools
        // ------------------------------------------

        // display all comfort form values
        $('#btn-comfort-display-values').unbind('click');
        $('#btn-comfort-display-values').click(function() {

            var copy_button = '<a id="comfort-form-copy-button" role="button" class="btn"><i class="icon-copy"></i> &nbsp; Copy to clipboard</a>';

            var entries = _this.get_comfort_form_entries();
            var data = entries.join('\n') + '\n';
            var modal_html = '<pre>' + data + '</pre>' + copy_button;

            var box = bootbox.alert({
                title: 'Contents of comfort form',
                message: modal_html,
            });

            // bind clipboard copy button
            var copy_button = box.find('#comfort-form-copy-button');
            navigatorApp.ui.copy_to_clipboard_bind_button('text/plain', data, {element: copy_button[0], wrapper: box[0]});

        });

        // clear all comfort form values
        $('#btn-comfort-clear').unbind('click');
        $('#btn-comfort-clear').click(function() {
            _this.clear_comfort_form();
        });

        // clear the whole expression (expert form)
        $('#btn-query-clear').unbind('click');
        $('#btn-query-clear').click(function() {
            $('#query').val('').focus();
            $('#cql-filter').val('');
        });

        // transform query: open modal dialog to choose transformation kind
        $('#btn-query-transform').unbind('click');
        $('#btn-query-transform').click(function() {
            if (_this.check_query_empty({'icon': 'icon-exchange'})) { return; }

            var dialog = $('#query-transform-dialog');
            dialog.modal('show');

            // Prevent displaying the modal under backdrop
            // https://weblog.west-wind.com/posts/2016/Sep/14/Bootstrap-Modal-Dialog-showing-under-Modal-Background
            dialog.appendTo("body");
        });

        // open query chooser
        $('#btn-query-history').unbind('click');
        $('#btn-query-history').click(function(e) {

            // setup select2 widget
            _this.cql_history_chooser_setup().then(function() {

                var opened = $('#cql-history-chooser').hasClass('open');

                // if already opened, skip event propagation to prevent wrong parent nesting
                if (opened) {
                    e.preventDefault();
                    e.stopPropagation();
                }

                // open select2 widget *after* dropdown has been opened
                // TODO: use "shown.bs.dropdown" event when migrating to bootstrap3
                var chooser_widget = $('#cql-history-chooser-select2');
                setTimeout(function() {
                    chooser_widget.select2('open');
                });

            });

        });

        // share via url, with ttl
        $('#btn-query-permalink').unbind('click');
        $('#btn-query-permalink').click(function(e) {

            e.preventDefault();
            e.stopPropagation();

            if (_this.check_query_empty({'icon': 'icon-external-link'})) { return; }

            var anchor = this;

            var query_state = {
                mode: 'liveview',
                context: 'viewer',
                project: 'query-permalink',
                query: navigatorApp.get_query().expression,
                datasource: navigatorApp.get_datasource(),
            };

            navigatorApp.permalink.make_uri_opaque(query_state).then(function(url) {

                // v1: open url
                //$(anchor).attr('href', url);

                // v2: open permalink popover
                navigatorApp.permalink.popover_show(anchor, url, {
                    title: 'External query review',
                    intro:
                        '<small>' +
                            'This offers a link for external/anonymous users to review the current query. ' +
                        '</small>',
                    ttl: true,
                });

            });
        });


        // transform query: modifier kind selected in dialog
        $('.btn-clipboard-modifier').click(function() {

            // get field name and operator from dialog
            var modifier = $(this).data('modifier');
            var operator = $('#clipboard-modifier-operator').find('.btn.active').data('value') || 'OR';

            // close dialog
            $('#query-transform-dialog').modal('hide');

            // compute new query content
            var text = $('#query').val().trim();
            if (_.str.contains(text, '=')) {
                return;
            }
            var entries = text.split('\n').filter(function(item) { return item != '\n' && item != ''; });
            var query = _(entries).map(function(item) {
                return modifier + '=' + '"' + item + '"';
            }).join(' ' + operator + ' ');

            // set query content and focus element
            $('#query').val(query);
            $('#query').focus();

        });


        // normalize numberlist
        $('#btn-numberlist-normalize').unbind('click');
        $('#btn-numberlist-normalize').click(function(e) {
            e.preventDefault();
            if (_this.check_numberlist_empty({'icon': 'icon-exchange'})) { return; }

            normalize_numberlist($('#numberlist').val()).then(function(response) {
                var numbers_valid = response['numbers-normalized'] && response['numbers-normalized']['valid'];
                var numbers_invalid = response['numbers-normalized'] && response['numbers-normalized']['invalid'];

                // replace numberlist in ui by normalized one
                $('#numberlist').val(numbers_valid.join('\n'));

                // display invalid patent numbers
                if (_.isEmpty(numbers_invalid)) {
                    navigatorApp.ui.notify(
                        'Patent numbers normalized successfully',
                        {type: 'success', icon: 'icon-exchange', right: true});
                } else {
                    var message = 'Number normalization failed for:<br/><br/><pre>' + numbers_invalid.join('\n') + '</pre>';
                    navigatorApp.ui.user_alert(message, 'warning');

                }
            });
        });

        // strip kindcodes from numbers in numberlist
        $('#btn-numberlist-strip-kindcodes').unbind('click');
        $('#btn-numberlist-strip-kindcodes').click(function(e) {
            e.preventDefault();
            if (_this.check_numberlist_empty({'icon': 'icon-eraser'})) { return; }

            var numberlist = $('#numberlist').val();
            var numbers = numberlist.split('\n');
            numbers = _(numbers).map(patent_number_strip_kindcode);
            $('#numberlist').val(numbers.join('\n'));

            navigatorApp.ui.notify(
                'Stripped patent kind codes',
                {type: 'success', icon: 'icon-eraser', right: true});

        });

    },

    clear_comfort_form: function() {
        $('#querybuilder-comfort-form').find('input').val('');
    },

    setup_quick_cql_builder: function() {

        // ------------------------------------------
        //   cql quick query builder
        //   NOTE: currently defunct
        // ------------------------------------------
        $('.btn-cql-boolean').button();
        $('#cql-quick-operator').find('.btn-cql-boolean').click(function() {
            $('#query').focus();
        });
        $('.btn-cql-field').click(function() {

            var query = $('#query').val();
            var operator = $('#cql-quick-operator').find('.btn-cql-boolean.active').data('value');
            var attribute = $(this).data('value');

            var position = $('#query').caret();
            var do_op = false;
            var do_att = true;
            //console.log('position: ' + position);

            var leftchar;
            if (position != 0) {
                do_op = true;

                // insert nothing if we're right off an equals "="
                leftchar = query.substring(position - 1, position);
                //console.log('leftchar: ' + leftchar);
                if (leftchar == '=') {
                    do_op = false;
                    do_att = false;
                }

                // don't insert operation if there's already one left of the cursor
                var fiveleftchar = query.substring(position - 5, position).toLowerCase();
                //console.log('fiveleftchar: ' + fiveleftchar);
                if (_.string.contains(fiveleftchar, 'and') || _.string.contains(fiveleftchar, 'or')) {
                    do_op = false;
                }

            }

            // manipulate query by inserting relevant
            // parts at the current cursor position
            var leftspace = (!leftchar || leftchar == ' ') ? '' : ' ';

            if (do_op)
                $('#query').caret(leftspace + operator);
            if (do_att)
                $('#query').caret((do_op ? ' ' : leftspace) + attribute);

            $('#query').focus();
        });

    },

    setup_cql_field_chooser: function(hide) {

        var datasource = navigatorApp.get_datasource();
        var queryflavor = navigatorApp.queryBuilderView.get_flavor();

        var analytics_actions = $('#analytics-actions')[0]; //.previousSibling;
        if (queryflavor == 'comfort') {
            $(analytics_actions).show();
        } else {
            $(analytics_actions).hide();
        }

        // TODO: reduce conditional weirdness
        if (hide || !datasource || _(['review', 'google', 'ftpro']).contains(datasource) || queryflavor != 'cql') {
            var chooser = $('#cql-field-chooser');
            if (chooser.exists()) {
                var container = chooser[0].previousSibling;
                $(container).hide();
            }
            return;
        }

        var fields_knowledge = FIELDS_KNOWLEDGE[datasource] || {};

        $('#cql-field-chooser').select2({
            placeholder: 'Field symbols' + ' (' + datasource + ')',
            data: { results: fields_knowledge.fields },
            dropdownCssClass: "bigdrop",
            escapeMarkup: function(text) { return text; },
            width: '100%',
        });
        $('#cql-field-chooser').unbind('change');
        $('#cql-field-chooser').on('change', function(event) {

            var value = $(this).val();
            if (!value) return;

            //console.log(value);

            var query = $('#query').val();
            var position = $('#query').caret();
            var leftchar = query.substring(position - 1, position);

            // skip insert if we're right behind a "="
            if (leftchar == fields_knowledge.meta.separator) {
                $('#query').focus();
                return;
            }

            // insert space before new field if there is none and we're not at the beginning
            if (leftchar != ' ' && position != 0) value = ' ' + value;

            $('#query').caret(value + fields_knowledge.meta.separator);
            $(this).data('select2').clear();

        });

    },

    setup_sorting_chooser: function() {

        log('setup_sorting_chooser');

        var datasource = navigatorApp.get_datasource();

        var fields_knowledge = FIELDS_KNOWLEDGE[datasource] || {};


        var element_field_chooser = $('#sort-field-chooser');
        var element_order_chooser = $('#sort-order-chooser');


        // --------------------
        //   sort field
        // --------------------

        element_field_chooser.select2({
            placeholder: '<i class="icon-sort"></i> Sorting',
            data: { results: fields_knowledge.sorting },
            dropdownCssClass: "bigdrop",
            escapeMarkup: function(text) { return text; },
        });

        element_field_chooser.unbind('change');
        element_field_chooser.on('change', function(event) {

            var value = $(this).val();
            if (!value) return;

            var sort_order = element_order_chooser.data('value');
            if (!sort_order) {
                element_order_chooser.click();
            }

        });


        // --------------------
        //   sort order
        // --------------------

        function sort_order_refresh() {

            //log('sort_order_refresh');

            // read from "data-value" attribute
            var value = element_order_chooser.data('value');

            // compute and set proper icon class
            var icon_class = 'icon-sort';
            if (value == 'asc') {
                icon_class = 'icon-sort-down';
            } else if (value == 'desc') {
                icon_class = 'icon-sort-up';
            }
            element_order_chooser.find('i').attr('class', icon_class);
        }
        sort_order_refresh();

        element_order_chooser.unbind('click');
        element_order_chooser.on('click', function(event) {

            // read from "data-value" attribute
            var value = $(this).data('value');

            //log('value-before:', value);

            // sort order state machine
            if (!value) {
                value = 'asc';
            } else if (value == 'asc') {
                value = 'desc';
            } else if (value == 'desc') {
                value = null;
            }

            //log('value-after: ', value);

            // store in "data-value" attribute
            $(this).data('value', value);

            sort_order_refresh();

        });

    },

    cql_history_chooser_get_data: function() {

        var deferred = $.Deferred();

        if (!navigatorApp.project) {
            var message = 'Project subsystem not started. Query history not available.';
            console.warn(message);
            navigatorApp.ui.notify(message, {type: 'warning', icon: 'icon-time'});
            deferred.reject();
            return deferred.promise();
        }

        log('cql_history_chooser_get_data: begin');

        // fetch query objects and sort descending by creation date
        var _this = this;
        $.when(navigatorApp.project.fetch_queries()).then(function() {
            var query_collection = navigatorApp.project.get('queries');
            query_collection = sortCollectionByField(query_collection, 'created', 'desc');
            var deferreds = [];
            var chooser_data = query_collection.map(function(query) {
                return _this.query_model_repr(query);
            });
            deferred.resolve(chooser_data);

        }).fail(function() {
            deferred.reject();
        });

        return deferred.promise();


        var queries = navigatorApp.project.get('queries');
        var chooser_data = _(queries).unique().map(function(query) {
            return { id: query, text: query };
        });
        return chooser_data;
    },

    query_model_repr: function(query) {


        // ------------------------------------------
        // Crunch some data for query history display
        // ------------------------------------------

        var flavor = query.get('flavor');
        var datasource = query.get('datasource');
        var query_data = query.get('query_data');
        var query_expert = query.get('query_expert');
        var created = query.get('created');
        var result_count = query.get('result_count');

        // Use query expression as title
        var expression = '';

        if (flavor == 'cql') {
            if (query_expert) {
                var parts = [query_expert.expression];
                if (query_expert.filter) {
                    parts.push(query_expert.filter);
                }
                expression = parts.join(', ');
            } else {
                // Backward compatibility
                expression = query.get('query_expression');
            }
        }

        if ((flavor == 'comfort' || datasource == 'ftpro') && query_data && _.isObject(query_data['criteria'])) {
            // serialize query_data criteria
            var entries = _.map(query_data['criteria'], function(value, key) {
                // add serialized representation of fulltext modifiers if not all(modifiers) == true
                if (key == 'fulltext' && query_data['modifiers'] && query_data['modifiers']['fulltext']) {
                    if (_.every(_.values(query_data['modifiers']['fulltext']))) {
                        value += ' [all]';

                    } else {
                        var modifiers = _.objFilter(query_data['modifiers']['fulltext'], function(value, key) {
                            return Boolean(value);
                        });
                        value += ' [' + _.keys(modifiers).join(',') + ']';

                    }
                }
                return key + ': ' + value;
            });
            expression = entries.join(', ');
        }

        // -----------------------------------------
        // Humanize values for query history display
        // -----------------------------------------

        // Item date
        created = moment(created).fromNow();

        // Search flavor
        var flavor_title = flavor;
        if (flavor == 'comfort') {
            flavor_title = 'Comfort';
        } else if (flavor == 'cql') {
            flavor_title = 'Expert';
        }

        // Data source
        var datasource_title = datasource;
        var datasource_color = 'default';
        if (datasource == 'ops') {
            datasource_title = 'EPO';
            datasource_color = 'important';
        } else if (datasource == 'depatisnet') {
            datasource_title = 'DPMA';
            datasource_color = 'inverse';
        } else if (datasource == 'ifi') {
            datasource_title = 'IFI Claims';
            datasource_color = 'info';
        } else if (datasource == 'depatech') {
            datasource_title = 'depa.tech';
            datasource_color = 'success';
        }

        // Result count
        var hits_title =
            (result_count ? Humanize.compactInteger(result_count, 1) : 'no') +
                (result_count == 1 ? ' hit' : ' hits');

        // Search modifiers
        var tags_html = [];
        if (_.isObject(query_data) && _.isObject(query_data['modifiers'])) {

            // Modifiers for OPS
            if (query_data['modifiers']['full-cycle']) {
                tags_html.push(this.html_history_tag('Full cycle', {name: 'fc', width: 'narrow'}));
            }
            if (query_data['modifiers']['family-swap-ger']) {
                tags_html.push(this.html_history_tag('Family member by priority', {name: 'fam:sw-ger', width: 'wide'}));
            }
            if (query_data['modifiers']['first-pub']) {
                tags_html.push(this.html_history_tag('First pub.', {name: 'pf', width: 'narrow'}));
            }
            if (query_data['modifiers']['recent-pub']) {
                tags_html.push(this.html_history_tag('Recent pub.', {name: 'rf', width: 'narrow'}));
            }

            // Modifiers for DPMA, FulltextPRO, IFI
            if (query_data['modifiers']['family-remove']) {
                tags_html.push(this.html_history_tag('Remove family members', {name: '-fam:rm', width: 'wide'}));
            }

            // Modifier for DPMA
            if (query_data['modifiers']['family-replace']) {
                tags_html.push(this.html_history_tag('Replace family members', {name: '-fam:rp', width: 'wide'}));
            }

            // Modifier for FulltextPRO
            if (query_data['modifiers']['family-full']) {
                tags_html.push(this.html_history_tag('Full family', {name: '+fam', width: 'narrow'}));
            }
        }

        // Sorting control
        if (_.isObject(query_data) && _.isObject(query_data['sorting'])) {
            tags_html.push(query_data.sorting.field + ':' + query_data.sorting.order);
        }

        // ------------------------------------------
        //               Generate HTML
        // ------------------------------------------

        // Left side
        var hits_bs =
            '<small/>' +
            this.html_history_tag(hits_title, {role: 'hits', type: 'badge', kind: result_count > 0 ? 'success' : 'default'}) +
            '</small>';
        var row1_left_side = [this.html_history_expression(expression)];
        var row2_left_side = [this.html_history_expression(hits_bs)];


        // Right side

        // Bootstrapify labels
        var row1_right_side = [
            this.html_history_tag(created, {type: 'text'}),
            this.html_history_tag(flavor_title, {role: 'flavor'}),
            this.html_history_tag(datasource_title, {role: 'datasource', kind: datasource_color}),
        ];
        var row2_right_side = tags_html;


        // The whole entry
        var entry_html =
            '<div class="container-fluid history-container">' +
            '<div class="row-fluid history-row-1">' + row1_left_side.join('') + this.html_history_labels(row1_right_side.join('')) + '</div>' +
            '<div class="row-fluid history-row-2">' + row2_left_side.join('') + this.html_history_labels(row2_right_side.join('')) + '</div>' +
            '</div>';
        var entry = {
            id: query,
            text: entry_html,
        };

        return entry;

    },

    html_history_expression: function(content) {
        return '<div class="span6 history-entry-expression">' + content + '</div>';
    },

    html_history_labels: function(content) {
        return '<div class="span6 history-entry-labels"><small>' + content + '</small></div>';
    },

    html_history_tag: function(content, options) {
        options = options || {};
        options.type = options.type || 'label';
        options.kind = options.kind || 'default';
        var classes = [
            options.type,
            options.type + '-' + options.kind,
            options.role  ? 'history-tag-' + options.role : '',
            options.width ? 'history-tag-' + options.width : '',
        ];
        return '<span class="' + classes.join(' ') + '">' + content + '</span>';
    },

    cql_history_chooser_setup: function() {

        var deferred = $.Deferred();

        var chooser_widget = $('#cql-history-chooser-select2');

        // initialize empty cql history chooser widget
        this.cql_history_chooser_load_data();

        // when query was selected, put it into cql query input field
        var _this = this;
        chooser_widget.unbind('change');
        chooser_widget.on('change', function(event) {

            $(this).unbind('change');

            // this gets the "id" attribute of an entry in select2 `data`
            var query_object = $(this).val();

            // transfer history data to current querybuilder state
            if (query_object) {

                var flavor = query_object.get('flavor');
                if (flavor == 'cql') {
                    _this.disable_compute_comfort_query = true;
                }
                _this.set_flavor(flavor);

                navigatorApp.set_datasource(query_object.get('datasource'));

                if (flavor == 'comfort') {
                    _this.clear_comfort_form();

                    var data = query_object.get('query_data');
                    _this.set_comfort_form_data(data);
                    _this.set_common_form_data(data);

                } else if (flavor == 'cql') {
                    log('history cql - query_object:', query_object);

                    _this.clear_comfort_form();

                    var query_expert = query_object.get('query_expert');
                    if (query_expert && query_expert.expression) {
                        $('#query').val(query_expert.expression);
                        $('#cql-filter').val(query_expert.filter);
                    } else {
                        // Backward compatibility
                        $('#query').val(query_object.get('query_expression'));
                        $('#cql-filter').val('');
                    }

                    var data = query_object.get('query_data');
                    _this.set_common_form_data(data);
                }

            }

            // Destroy widget and close dropdown container
            _this.cql_history_chooser_destroy($(this));

        });

        // load query history data and propagate to history chooser
        this.cql_history_chooser_get_data().then(function(data) {
            _this.cql_history_chooser_load_data(data);
            deferred.resolve();
        }).fail(function(event) {
            deferred.reject();
            _this.cql_history_chooser_destroy($(chooser_widget));
        });

        return deferred.promise();

    },

    cql_history_chooser_destroy: function(element) {
        // Destroy widget and close dropdown container
        element.data('select2').destroy();
        element.dropdown().toggle();
        //element.closest('#cql-history-chooser-container').hide();
    },

    cql_history_chooser_load_data: function(data) {
        var chooser_widget = $('#cql-history-chooser-select2');
        chooser_widget.select2({
            dropdownCssClass: "bigdrop history-dropdown",
            escapeMarkup: function(text) { return text; },
            data: (data || { results: [] }),
        });
    },

    setup_common_form: function() {
        var container = $('#querybuilder-area');
        var datasource = navigatorApp.get_datasource();

        var _this = this;

        // display "(Remove|Replace) family members" only for certain search backends
        var button_family_remove         = container.find("button[id='btn-family-remove']");
        var button_family_remove_replace = container.find("button[id='btn-family-remove'],button[id='btn-family-replace']");
        if (_(['depatisnet']).contains(datasource)) {
            button_family_remove_replace.show();
        } else if (_(['ftpro', 'ifi']).contains(datasource)) {
            button_family_remove_replace.hide();
            button_family_remove.show();
        } else {
            button_family_remove_replace.hide();
        }

        // display "Full family" only for certain search backends
        var button_family_full = container.find("button[id='btn-family-full']");
        if (_(['ftpro']).contains(datasource)) {
            button_family_full.show();
        } else {
            button_family_full.hide();
        }

        // display sorting only for certain search backends
        if (_(['depatisnet']).contains(datasource)) {
            $('#sorting-chooser').show();
            this.setup_sorting_chooser();
        } else {
            $('#sorting-chooser').hide();
        }

        // display CQL filter only for datasource IFI
        if (_(['ifi']).contains(datasource)) {
            $('#cql-filter-container').show();
        } else {
            $('#cql-filter-container').hide();
        }

    },

    setup_comfort_form: function() {
        var form = $('#querybuilder-comfort-form');
        var datasource = navigatorApp.get_datasource();

        var _this = this;

        // fix submit by enter for internet explorer
        form.handle_enter_keypress();

        // hide publication date for certain search backends
        var pubdate = form.find("input[name='pubdate']").closest("div[class='control-group']");
        if (_(['ops', 'depatisnet', 'ftpro']).contains(datasource)) {
            pubdate.show();
        } else if (_(['google']).contains(datasource)) {
            pubdate.hide();
        }

        // hide citations for certain search backends
        var citation = form.find("input[name='citation']").closest("div[class='control-group']");
        if (_(['ops', 'depatisnet', 'ifi']).contains(datasource)) {
            citation.show();
        } else if (_(['google', 'ftpro', 'depatech']).contains(datasource)) {
            citation.hide();
        }

        // amend placeholder values for certain search backends
        function activate_placeholder(element, kind) {
            element.attr('placeholder', element.data('placeholder-' + kind));
        }

        var patentnumber = form.find("input[name='patentnumber']");
        if (_(['google', 'ftpro', 'ifi']).contains(datasource)) {
            activate_placeholder(patentnumber, 'single');
        } else if (datasource == 'depatech') {
            activate_placeholder(patentnumber, 'depatech');
        } else {
            activate_placeholder(patentnumber, 'multi');
        }

        var input_class = form.find("input[name='class']");
        /*
        if (_(['ifi']).contains(datasource)) {
            activate_placeholder(input_class, 'single');
        } else {
            activate_placeholder(input_class, 'multi');
        }
        */
        activate_placeholder(input_class, 'multi');

        var inventor = form.find("input[name='inventor']");
        if (datasource == 'depatech') {
            activate_placeholder(inventor, 'depatech');
        } else {
            activate_placeholder(inventor, 'default');
        }

        // enrich form fields with actions
        _.each(form.find(".input-prepend"), function(item) {

            // populate field value with placeholder value on demand
            $(item).find('.add-on.add-on-label').on('click', function(ev) {
                var input_element = $(item).find('input');
                if (!input_element.val()) {
                    var demo_value = input_element.attr('placeholder');
                    if (input_element.data('demo')) {
                        demo_value = input_element.data('demo');
                    }
                    input_element.val(demo_value);
                }
            });

            // zoom input field to textarea
            $(item).find('.add-on.add-on-zoom').on('click', function(ev) {
                var input_element = $(item).find('input');
                _this.comfort_form_regular_to_zoomed(input_element);
            });
        });

        // conditionally display fulltext-modifier-chooser
        if (_(['ftpro']).contains(datasource)) {
            $('#fulltext-modifier-chooser').show();
            $('#fulltext-textarea-container').removeClass('span12').addClass('span11');
            $('#fulltext-textarea-container').find('textarea').removeClass('span11').addClass('span10');
        } else {
            $('#fulltext-modifier-chooser').hide();
            $('#fulltext-textarea-container').removeClass('span11').addClass('span12');
            $('#fulltext-textarea-container').find('textarea').removeClass('span10').addClass('span11');
        }

    },

    comfort_form_regular_to_zoomed: function(input_element) {

        var _this = this;

        var fieldname = input_element.attr('name');
        var value = input_element.val();
        var fieldset = $('#querybuilder-comfort-form > fieldset');
        fieldset.children('.field-regular').hide();

        var zoomed_element = fieldset.children('#' + fieldname + '-zoomed');
        zoomed_element.fadeIn();

        var textarea = zoomed_element.find('textarea');
        textarea.val(value);
        textarea.focus();

        navigatorApp.hotkeys.querybuilder_zoomed_hotkeys(textarea, input_element);
        navigatorApp.hotkeys.querybuilder_hotkeys(textarea);

    },

    comfort_form_zoomed_to_regular_data: function() {
        var fieldset = $('#querybuilder-comfort-form > fieldset');
        var zoomed = fieldset.children('.field-zoomed').is(":visible");
        if (zoomed) {
            var textarea = fieldset.children('.field-zoomed:visible').find('textarea');
            var fieldname = textarea.data('name');
            var value = textarea.val();
            fieldset.find('input[name="' + fieldname + '"]').val(value);
        }
    },

    comfort_form_zoomed_to_regular_ui: function(input_element) {
        var fieldset = $('#querybuilder-comfort-form > fieldset');
        fieldset.children('.field-zoomed').hide();
        fieldset.children('.field-regular').fadeIn();
        input_element && input_element.focus();
    },

    get_form_modifier_elements: function() {

        var datasource = navigatorApp.get_datasource();
        var modifier_buttons_selector = 'button[data-name="full-cycle"],[data-name="family-swap-ger"]';
        modifier_buttons_selector += ',[data-name="first-pub"]';
        modifier_buttons_selector += ',[data-name="recent-pub"]';

        if (_(['depatisnet']).contains(datasource)) {
            modifier_buttons_selector += ',[data-name="family-remove"]';
            modifier_buttons_selector += ',[data-name="family-replace"]';
        }
        if (_(['ftpro', 'ifi']).contains(datasource)) {
            modifier_buttons_selector += ',[data-name="family-remove"]';
        }
        if (_(['ftpro']).contains(datasource)) {
            modifier_buttons_selector += ',[data-name="family-full"]';
        }

        var elements = $('#querybuilder-area').find(modifier_buttons_selector);
        return elements;
    },

    get_common_form_data: function() {
        var flavor = this.get_flavor();
        var datasource = navigatorApp.get_datasource();

        var modifier_elements = this.get_form_modifier_elements();
        var modifiers = this.radios.get_state(modifier_elements);
        var sorting = this.collect_sorting_state_from_ui();

        var form_data = {
            format: flavor,
            datasource: datasource,
            modifiers: modifiers,
            //query: navigatorApp.config.get('query'),
        };

        if (sorting) {
            form_data.sorting = sorting;
        }

        return form_data;
    },

    set_common_form_data: function(data, options) {
        options = options || {};

        // populate query modifiers to user interface
        var _this = this;
        var modifier_elements = this.get_form_modifier_elements();

        _.each(modifier_elements, function(element) {
            var name = $(element).data('name');

            if (data && data.modifiers && data.modifiers[name]) {
                $(element).addClass('active');
                $(element).addClass('btn-info');
            } else {
                $(element).removeClass('active');
                $(element).removeClass('btn-info');
            }

            // set label text to default
            _this.radios.label_behaviour(element, true);

        });

        _.each(modifier_elements, function(element) {
            var is_active = $(element).hasClass('active');
            if (is_active) {
                // set label text to selected one
                _this.radios.label_behaviour(element, false);
            }
        });


        // populate sorting state to user interface
        if (data && data.sorting) {
            //log('data.sorting:', data.sorting);
            $('#sort-field-chooser').select2("val", data.sorting.field);
            $('#sort-order-chooser').data('value', data.sorting.order);
            this.setup_sorting_chooser();
        } else {
            $('#sort-field-chooser').select2("val", null);
            $('#sort-order-chooser').data('value', null);
            this.setup_sorting_chooser();
        }

    },

    get_comfort_form_data: function() {

        // 1. collect search criteria from comfort form input fields
        var criteria = {};
        var form = $('#querybuilder-comfort-form');
        var fields = $(form).find($('input'));
        _.each(fields, function(item) {
            if (item.value) {
                criteria[item.name] = item.value;
            }
        });

        // skip if collected criteria is empty
        if (_.isEmpty(criteria)) {
            return;
        }

        // 2. collect modifiers from user interface
        var buttons = $('#querybuilder-area').find($('button[data-name="fulltext"]'));
        var modifiers = this.radios.get_state(buttons);

        var payload = this.get_common_form_data();

        var payload_local = {
            criteria: criteria,
            modifiers: modifiers,
        };

        // merge common- and comfort-form-data
        $.extend(true, payload, payload_local);
        //log('========= payload:', payload);

        return payload;

    },

    set_comfort_form_data: function(data, options) {
        options = options || {};

        // populate input fields
        var form = $('#querybuilder-comfort-form');
        _.each(data['criteria'], function(value, key) {
            var element = form.find('input[name="' + key + '"]');
            element.val(value);
        });

        // populate fulltext modifiers
        if (data['modifiers'] && _.isObject(data['modifiers']['fulltext'])) {
            _.each(data['modifiers']['fulltext'], function(value, key) {
                var element = $(form).find($('button[data-name="fulltext"][data-modifier="' + key + '"]'));
                if (value) {
                    element.addClass('active');
                } else {
                    element.removeClass('active');
                }
            });
        }

    },

    collect_sorting_state_from_ui: function() {
        var sort_state;

        var datasource = navigatorApp.get_datasource();

        if (_(['depatisnet']).contains(datasource)) {
            var field_chooser = $('#querybuilder-area').find('#sort-field-chooser');
            var order_chooser = $('#querybuilder-area').find('#sort-order-chooser');
            sort_field = field_chooser.val();
            sort_order = order_chooser.data('value');
            if (sort_field && sort_order) {
                sort_state = {
                    field: sort_field,
                    order: sort_order,
                };
            }
        }

        //log('sorting state:', sort_state);

        return sort_state;

    },


    compute_comfort_query: function() {

        if (this.disable_compute_comfort_query) {
            this.disable_compute_comfort_query = false;
            var deferred = $.Deferred();
            deferred.reject();
            return deferred;
        }

        var payload = this.get_comfort_form_data();
        if (_.isEmpty(payload)) {
            var deferred = $.Deferred();
            deferred.reject();
            return deferred;
        }

        log('Comfort form criteria:', JSON.stringify(payload));

        //$("#query").val('');
        $("#keywords").val('[]');
        return this.compute_query_expression(payload).then(function(data, keywords) {
            log('Expert query data:', JSON.stringify(data));
            $("#query").val(data['expression']);
            $("#cql-filter").val(data['filter']);
            $("#keywords").val(keywords);

        }).fail(function() {
            $("#query").val('');
            $("#keywords").val('');
            navigatorApp.ui.reset_content({documents: true, keep_notifications: true});
        });
    },

    compute_query_expression: function(payload) {
        var deferred = $.Deferred();
        $.ajax({
            method: 'post',
            url: '/api/util/query-expression',
            beforeSend: function(xhr, settings) {
                xhr.requestUrl = settings.url;
            },
            data: JSON.stringify(payload),
            contentType: "application/json; charset=utf-8",
        }).success(function(data, status, options) {
            if (data) {
                var keywords = options.getResponseHeader('X-PatZilla-Query-Keywords');
                deferred.resolve(data, keywords);
            } else {
                deferred.resolve({}, '[]');
            }
        }).error(function(xhr, settings) {
            navigatorApp.ui.propagate_backend_errors(xhr);
            deferred.reject();
        });
        return deferred.promise();
    },

    get_flavor: function() {
        var flavor = $('#querybuilder-flavor-chooser > .btn.active').data('value');
        return flavor;
    },

    set_flavor: function(flavor) {
        $("#querybuilder-flavor-chooser .btn[data-value='" + flavor + "']").tab('show');
    },

    set_numberlist: function(numberlist) {
        if (!_.isEmpty(numberlist)) {
            this.set_flavor('numberlist');

            // .html() does not work in IE
            //$('#numberlist').html(numberlist);
            $('#numberlist').val(numberlist);

            navigatorApp.perform_numberlistsearch();
        }
    },

});


// setup component
navigatorApp.addInitializer(function(options) {

    this.listenToOnce(this, 'application:init', function() {
        this.queryBuilderView = new QueryBuilderView({});
        this.queryBuilderRegion.show(this.queryBuilderView);
    });

    // Special bootstrap handling for numberlist=EP666666,EP666667:
    this.listenTo(this, 'application:ready', function() {
        var numberlist_raw = this.config.get('numberlist');
        if (numberlist_raw) {
            var numberlist = decodeURIComponent(numberlist_raw);
            this.queryBuilderView.set_numberlist(numberlist);
        }
    });

});
