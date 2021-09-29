// Stupid cash-dom table plugin.
import cash from 'cash-dom';

const $ = cash;

$.fn.stupidtable = function (sortFns) {
    return this.each(function () {
        const $table = $(this);
        sortFns = sortFns || {};
        let sortFnsTmp = {};
        sortFnsTmp = $.extend(sortFnsTmp, $.fn.stupidtable.default_sort_fns);
        sortFns = $.extend(sortFnsTmp, sortFns);
        $table.data('sortFns', sortFns);
        $table.stupidtable_build();

        $table.on('click.stupidtable', 'thead th', function () {
            $(this).stupidsort();
        });

        // Sort th immediately if data-sort-onload="yes" is specified. Limit to
        // the first one found - only one default sort column makes sense anyway.
        const $th_onload_sort = $table.find('th[data-sort-onload=yes]').eq(0);
        $th_onload_sort.stupidsort();
    });
};

// ------------------------------------------------------------------
// Default settings
// ------------------------------------------------------------------
$.fn.stupidtable.default_settings = {
    should_redraw: (sort_info) => true,
    will_manually_build_table: false
};
$.fn.stupidtable.dir = { ASC: 'asc', DESC: 'desc' };
$.fn.stupidtable.default_sort_fns = {
    int: (a, b) => parseInt(a, 10) - parseInt(b, 10),
    float: (a, b) => parseFloat(a) - parseFloat(b),
    string: (a, b) => a.toString().localeCompare(b.toString()),
    'string-ins': (a, b) => {
        a = a.toString().toLocaleLowerCase();
        b = b.toString().toLocaleLowerCase();
        return a.localeCompare(b);
    }
};

// Allow specification of settings on a per-table basis. Call on a table
// jquery object. Call *before* calling .stuidtable();
$.fn.stupidtable_settings = function (settings) {
    return this.each(function () {
        const $table = $(this);
        let settingsTmp = {};
        settingsTmp = $.extend(settingsTmp, $.fn.stupidtable.default_settings);
        const final_settings = $.extend(settingsTmp, settings);
        $table.stupidtable.settings = final_settings;
    });
};

// Expects $("#mytable").stupidtable() to have already been called.
// Call on a table header.
$.fn.stupidsort = function (force_direction) {
    const $this_th = $(this);
    const datatype = $this_th.data('sort') || null;

    // No datatype? Nothing to do.
    if (datatype === null) {
        return;
    }

    const $table = $this_th.closest('table');

    const sort_info = {
        $th: $this_th,
        $table: $table,
        datatype: datatype
    };

    // Bring in default settings if none provided
    if (!$table.stupidtable.settings) {
        $table.stupidtable.settings = $.extend({}, $.fn.stupidtable.default_settings);
    }

    sort_info.compare_fn = $table.data('sortFns')[datatype];
    sort_info.th_index = calculateTHIndex(sort_info);
    sort_info.sort_dir = calculateSortDir(force_direction, sort_info);

    $this_th.data('sort-dir', sort_info.sort_dir);
    $table.trigger('beforetablesort', { column: sort_info.th_index, direction: sort_info.sort_dir, $th: $this_th });

    // More reliable method of forcing a redraw
    $table.css('display');

    // Run sorting asynchronously on a timout to force browser redraw after
    // `beforetablesort` callback. Also avoids locking up the browser too much.
    setTimeout(() => {
        if (!$table.stupidtable.settings.will_manually_build_table) {
            $table.stupidtable_build();
        }
        const table_structure = sortTable(sort_info);
        const trs = getTableRowsFromTableStructure(table_structure, sort_info);

        if (!$table.stupidtable.settings.should_redraw(sort_info)) {
            return;
        }
        $table.children('tbody').append(trs);

        updateElementData(sort_info);
        $table.trigger('aftertablesort', { column: sort_info.th_index, direction: sort_info.sort_dir, $th: $this_th });
        $table.css('display');
    }, 10);
    return $this_th;
};

// Call on a sortable td to update its value in the sort. This should be the
// only mechanism used to update a cell's sort value. If your display value is
// different from your sort value, use jQuery's .text() or .html() to update
// the td contents, Assumes stupidtable has already been called for the table.
$.fn.updateSortVal = function (new_sort_val) {
    const $this_td = $(this);
    if ($this_td.is('[data-sort-value]')) {
    // For visual consistency with the .data cache
        $this_td.attr('data-sort-value', new_sort_val);
    }
    $this_td.data('sort-value', new_sort_val);
    return $this_td;
};

$.fn.stupidtable_build = function () {
    return this.each(function () {
        const $table = $(this);
        const trs = $table.children('tbody').children('tr');
        const table_structure = new Array(trs.length);
        trs.each((index, tr_) => {
            const tr = $(tr_);

            // ====================================================================
            // Transfer to using internal table structure
            // ====================================================================
            const children = tr.children('td');
            const ele = {
                $tr: tr,
                columns: new Array(children.length),
                index: index
            };

            children.each(function (idx, td_) {
                const td = $(td_);
                let sort_val = td.data('sort-value');

                // Store and read from the .data cache for display text only sorts
                // instead of looking through the DOM every time
                if (typeof (sort_val) === 'undefined') {
                    const txt = td.text();
                    td.data('sort-value', txt);
                    sort_val = txt;
                }
                ele.columns[idx] = sort_val;
            });
            table_structure[index] = ele;
        });
        $table.data('stupidsort_internaltable', table_structure);
    });
};

// ====================================================================
// Private functions
// ====================================================================
const sortTable = (sort_info) => {
    const table_structure = sort_info.$table.data('stupidsort_internaltable');
    const th_index = sort_info.th_index;
    const $th = sort_info.$th;

    const multicolumn_target_str = $th.data('sort-multicolumn');
    let multicolumn_targets;
    if (multicolumn_target_str) {
        multicolumn_targets = multicolumn_target_str.split(',');
    } else {
        multicolumn_targets = [];
    }
    const multicolumn_th_targets = $.map(multicolumn_targets, (identifier, i) => get_th(sort_info.$table, identifier));

    const dirMult = sort_info.sort_dir !== $.fn.stupidtable.dir.ASC ? -1 : 1;

    table_structure.sort((e1, e2) => {
        let diff = sort_info.compare_fn(e1.columns[th_index], e2.columns[th_index]);
        if (diff === 0) {
            const multicolumns = multicolumn_th_targets.slice(0); // shallow copy
            while (diff === 0 && multicolumns.length) {
                const multicolumn = multicolumns[0];
                const datatype = multicolumn.$e.data('sort');
                const multiCloumnSortMethod = sort_info.$table.data('sortFns')[datatype];
                diff = multiCloumnSortMethod(e1.columns[multicolumn.index], e2.columns[multicolumn.index]);
                multicolumns.shift();
            }
        }
        // Sort by position in the table if values are the same. This enforces a
        // stable sort across all browsers. See https://bugs.chromium.org/p/v8/issues/detail?id=90
        if (diff === 0) {
            return dirMult * (e1.index - e2.index);
        } else {
            return dirMult * diff;
        }
    });

    return table_structure;
};

const get_th = ($table, identifier) => {
    // identifier can be a th id or a th index number;
    const $table_ths = $table.find('th');
    let index = parseInt(identifier, 10);
    let $th;
    if (!index && index !== 0) {
        $th = $table_ths.siblings('#' + identifier);
        index = $table_ths.index($th);
    } else {
        $th = $table_ths.eq(index);
    }
    return { index: index, $e: $th };
};

const getTableRowsFromTableStructure = (table_structure, sort_info) => {
    // Gather individual column for callbacks
    const column = $.map(table_structure, (ele, i) => [[ele.columns[sort_info.th_index], ele.$tr, i]]);

    /* Side effect */
    sort_info.column = column;

    // Replace the content of tbody with the sorted rows. Strangely
    // enough, .append accomplishes this for us.
    return $.map(table_structure, (ele) => ele.$tr);
};

const updateElementData = (sort_info) => {
    const $table = sort_info.$table;
    const $this_th = sort_info.$th;
    const sort_dir = $this_th.data('sort-dir');

    // Reset siblings
    $table.find('th').data('sort-dir', null).removeClass('sorting-desc sorting-asc');
    $this_th.data('sort-dir', sort_dir).addClass('sorting-' + sort_dir);
};

const calculateSortDir = (force_direction, sort_info) => {
    let sort_dir;
    const $this_th = sort_info.$th;
    const dir = $.fn.stupidtable.dir;

    if (force_direction) {
        sort_dir = force_direction;
    } else {
        sort_dir = force_direction || $this_th.data('sort-default') || dir.ASC;
        if ($this_th.data('sort-dir')) { sort_dir = $this_th.data('sort-dir') === dir.ASC ? dir.DESC : dir.ASC; }
    }
    return sort_dir;
};

const calculateTHIndex = (sort_info) => {
    let th_index = 0;
    const base_index = sort_info.$th.index();
    sort_info.$th.parents('tr').find('th').slice(0, base_index).each(function () {
        const cols = $(this).attr('colspan') || 1;
        th_index += parseInt(cols, 10);
    });
    return th_index;
};
