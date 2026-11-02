"use strict";

// ECMA-402 §11; test262/test/intl402/DateTimeFormat.
var dateOptions = [
    {}, {year: "numeric", month: "long", day: "numeric", weekday: "long"},
    {year: "2-digit", month: "2-digit", day: "2-digit"}, {era: "long", year: "numeric", month: "short", day: "numeric"},
    {hour: "numeric", minute: "2-digit", second: "2-digit", hourCycle: "h11"},
    {hour: "numeric", minute: "2-digit", second: "2-digit", hourCycle: "h12"},
    {hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"},
    {hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h24"},
    {hour: "numeric", dayPeriod: "long", hourCycle: "h12"},
    {hour: "2-digit", minute: "2-digit", second: "2-digit", fractionalSecondDigits: 3, hourCycle: "h23"},
    {dateStyle: "full"}, {dateStyle: "long"}, {dateStyle: "medium"}, {dateStyle: "short"},
    {timeStyle: "full"}, {timeStyle: "long"}, {timeStyle: "medium"}, {timeStyle: "short"},
    {dateStyle: "long", timeStyle: "short"}
];

localeInputs.forEach(function (locale) {
    dateOptions.forEach(function (input, index) {
        test(locale + "/format-and-parts/" + index, function () {
            var options = Object.assign({timeZone: "UTC"}, input);
            var df = new Intl.DateTimeFormat(locale, options);
            [0, Date.UTC(2020, 1, 29, 0, 5, 7, 123), Date.UTC(2024, 6, 15, 13, 45, 59, 999), -2208988800000].forEach(function (value) {
                var expected = reference("date", {locale: locale, options: options, value: value});
                same(df.format(value), expected.text);
                var parts = df.formatToParts(value);
                checkParts(parts, expected.text, datePartTypes);
                equal(parts, expected.parts);
            });
        });
    });
    [{year: "numeric", month: "short", day: "numeric"}, {hour: "numeric", minute: "2-digit", hourCycle: "h23"}].forEach(function (input, index) {
        test(locale + "/range/" + index, function () {
            var options = Object.assign({timeZone: "UTC"}, input);
            var df = new Intl.DateTimeFormat(locale, options);
            [[Date.UTC(2020, 0, 1, 1), Date.UTC(2020, 0, 5, 3)], [0, 0], [0, 60000]].forEach(function (range) {
                var expected = reference("date", {locale: locale, options: options, value: range[0], end: range[1]});
                same(df.formatRange(range[0], range[1]), expected.text);
                var parts = df.formatRangeToParts(range[0], range[1]);
                checkParts(parts, expected.text, datePartTypes, true);
                equal(parts, expected.parts);
            });
        });
    });
});

["UTC", "America/New_York", "Europe/Berlin", "Asia/Kolkata", "+05:30", "-04:00"].forEach(function (zone) {
    ["short", "long", "shortOffset", "longOffset", "shortGeneric", "longGeneric"].forEach(function (zoneName) {
        test("time-zone/" + zone + "/" + zoneName, function () {
            var options = {year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: zone, timeZoneName: zoneName, hourCycle: "h23"};
            var df = new Intl.DateTimeFormat("en-US", options);
            [Date.UTC(2024, 2, 10, 6, 59), Date.UTC(2024, 2, 10, 7), Date.UTC(2024, 10, 3, 5, 59), Date.UTC(2024, 10, 3, 6)].forEach(function (value) {
                same(df.format(value), reference("date", {locale: "en-US", options: options, value: value}).text);
            });
        });
    });
});

["gregory", "buddhist", "japanese", "hebrew", "islamic-civil", "persian", "chinese"].forEach(function (calendar) {
    test("calendar/" + calendar, function () {
        var options = {calendar: calendar, year: "numeric", month: "long", day: "numeric", timeZone: "UTC"};
        var df = new Intl.DateTimeFormat("ja-JP", options);
        var expected = reference("date", {locale: "ja-JP", options: options, value: Date.UTC(2024, 1, 10)});
        same(df.format(Date.UTC(2024, 1, 10)), expected.text);
        equal(df.formatToParts(Date.UTC(2024, 1, 10)), expected.parts);
        same(df.resolvedOptions().calendar, reference("dateDefaults", {locale: "ja-JP", options: options}).calendar);
    });
});

localeInputs.forEach(function (locale) {
    test(locale + "/resolvedOptions-defaults", function () {
        var result = new Intl.DateTimeFormat(locale, {timeZone: "UTC"}).resolvedOptions();
        var expected = reference("dateDefaults", {locale: locale, options: {timeZone: "UTC"}});
        same(result.calendar, expected.calendar);
        same(result.numberingSystem, expected.numberingSystem);
        same(result.timeZone, "UTC");
        same(result.year, "numeric");
        same(result.month, "numeric");
        same(result.day, "numeric");
        same("hourCycle" in result, false);
        same("hour12" in result, false);
        var withHour = new Intl.DateTimeFormat(locale, {hour: "numeric"}).resolvedOptions();
        same(withHour.hourCycle, expected.hourCycle);
        same(withHour.hour12, expected.hourCycle === "h11" || expected.hourCycle === "h12");
        var style = new Intl.DateTimeFormat(locale, {dateStyle: "long", timeStyle: "short"}).resolvedOptions();
        same(style.dateStyle, "long");
        same(style.timeStyle, "short");
        ["year", "month", "day", "hour", "minute", "second"].forEach(function (key) { same(key in style, false); });
    });
});

test("extension-and-hour12-precedence", function () {
    var result = new Intl.DateTimeFormat("en-u-ca-buddhist-nu-thai-hc-h24", {calendar: "gregory", numberingSystem: "latn", hour: "numeric", hourCycle: "h23"}).resolvedOptions();
    same(result.calendar, "gregory");
    same(result.numberingSystem, "latn");
    same(result.hourCycle, "h23");
    [true, false].forEach(function (hour12) {
        var options = {hour: "numeric", hour12: hour12};
        var expected = new Intl.DateTimeFormat("en-US", options).resolvedOptions();
        equal(new Intl.DateTimeFormat("en-US", Object.assign({hourCycle: "h11"}, options)).resolvedOptions(), expected);
        same(expected.hour12, hour12);
    });
    same(new Intl.DateTimeFormat("en", {timeZone: "uTc"}).resolvedOptions().timeZone, "UTC");
    same(new Intl.DateTimeFormat("en", {timeZone: "+0530"}).resolvedOptions().timeZone, "+05:30");
});

["weekday", "era", "dayPeriod"].forEach(function (key) { rejectsOption("DateTimeFormat", key, ["", "numeric", null]); });
["year", "day", "hour", "minute", "second"].forEach(function (key) { rejectsOption("DateTimeFormat", key, ["", "long", null]); });
rejectsOption("DateTimeFormat", "month", ["", "full", null]);
rejectsOption("DateTimeFormat", "dateStyle", ["", "narrow", null]);
rejectsOption("DateTimeFormat", "timeStyle", ["", "narrow", null]);
rejectsOption("DateTimeFormat", "timeZoneName", ["", "offset", null]);
rejectsOption("DateTimeFormat", "hourCycle", ["", "h13", null]);
rejectsOption("DateTimeFormat", "formatMatcher", ["", "best-fit", null]);
rejectsOption("DateTimeFormat", "fractionalSecondDigits", [0, 4, NaN, Infinity]);
rejectsOption("DateTimeFormat", "calendar", ["", "a", "abcdefghi", "gregory_"]);
rejectsOption("DateTimeFormat", "numberingSystem", ["", "a", "abcdefghi", "latn_"]);
rejectsOption("DateTimeFormat", "timeZone", ["", "Not/AZone", "+24:00", "+01:60", "+01:00:30", "Z"]);

test("style-component-conflicts", function () {
    ["weekday", "era", "year", "month", "day", "dayPeriod", "hour", "minute", "second", "fractionalSecondDigits", "timeZoneName"].forEach(function (component) {
        var options = {dateStyle: "short"};
        options[component] = component === "fractionalSecondDigits" ? 3 : ["weekday", "era", "dayPeriod", "timeZoneName"].indexOf(component) !== -1 ? "short" : "numeric";
        throws(TypeError, function () { new Intl.DateTimeFormat("en", options); });
    });
});

test("timeclip-coercion-and-range-errors", function () {
    var df = new Intl.DateTimeFormat("en", {timeZone: "UTC"});
    [NaN, Infinity, -Infinity, 8640000000000001, -8640000000000001].forEach(function (value) {
        throws(RangeError, function () { df.format(value); });
        throws(RangeError, function () { df.formatToParts(value); });
    });
    same(df.format(null), df.format(0));
    same(df.format("0"), df.format(0));
    same(df.format(new Date(0)), df.format(0));
    same(df.format(0.9), df.format(0));
    var before = Date.now();
    var now = df.format();
    var after = Date.now();
    assert(now === df.format(before) || now === df.format(after));
    throws(TypeError, function () { df.format(Symbol()); });
    if (typeof BigInt === "function") throws(TypeError, function () { df.format(BigInt(0)); });
    abrupt(function (sentinel) { df.format({valueOf: function () { throw sentinel; }}); });
    ["formatRange", "formatRangeToParts"].forEach(function (method) {
        throws(TypeError, function () { df[method](); });
        throws(TypeError, function () { df[method](0); });
        throws(RangeError, function () { df[method](NaN, 0); });
        throws(RangeError, function () { df[method](0, Infinity); });
        // Edition 13 permits descending ranges; ICU is the reference for their presentation.
        same(joined(df.formatRangeToParts(86400000, 0)), df.formatRange(86400000, 0));
        abrupt(function (sentinel) { df[method](0, {valueOf: function () { throw sentinel; }}); });
    });
});

testEach("ICU-inventory/all-calendars", {operation: "supportedValues", request: {key: "calendar"}}, function (calendar) {
    var options = {calendar: calendar, year: "numeric", month: "long", day: "numeric", timeZone: "UTC"};
    var df = new Intl.DateTimeFormat("en", options);
    same(df.resolvedOptions().calendar, reference("dateDefaults", {locale: "en", options: options}).calendar);
    var expected = reference("date", {locale: "en", options: options, value: 0});
    same(df.format(0), expected.text, calendar);
    equal(df.formatToParts(0), expected.parts, calendar);
});

test("basic-format-matcher", function () {
    var options = {year: "numeric", month: "numeric", day: "numeric", timeZone: "UTC", formatMatcher: "basic"};
    localeInputs.forEach(function (locale) {
        var df = new Intl.DateTimeFormat(locale, options);
        same(df.format(0), reference("date", {locale: locale, options: options, value: 0}).text);
        checkParts(df.formatToParts(0), df.format(0), datePartTypes);
    });
});
