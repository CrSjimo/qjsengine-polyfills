"use strict";

// ECMA-402 §13; test262/test/intl402/DurationFormat.
var durationUnits = ["years", "months", "weeks", "days", "hours", "minutes", "seconds", "milliseconds", "microseconds", "nanoseconds"];

localeInputs.forEach(function (locale) {
    ["long", "short", "narrow"].forEach(function (style) {
        test(locale + "/textual/" + style, function () {
            var options = {style: style};
            var df = new Intl.DurationFormat(locale, options);
            [{seconds: 0}, {years: 1, months: 2, weeks: 3, days: 4}, {hours: 1, minutes: 2, seconds: 3}, {milliseconds: 12, microseconds: 34, nanoseconds: 56}, {years: -1, months: -2, days: -3, hours: -4}].forEach(function (duration) {
                var expected = reference("duration", {locale: locale, options: options, duration: duration});
                same(df.format(duration), expected.text);
                var parts = df.formatToParts(duration);
                same(joined(parts), expected.text);
                equal(parts, expected.parts);
                parts.forEach(function (part) {
                    ordinary(part, "unit" in part ? ["type", "value", "unit"] : ["type", "value"]);
                    assert(numberPartTypes.indexOf(part.type) !== -1);
                    if ("unit" in part) assert(durationUnits.indexOf(part.unit + "s") !== -1);
                });
            });
            var resolved = df.resolvedOptions();
            same(resolved.style, style);
            same(resolved.numberingSystem, reference("numberDefaults", {locale: locale}).numberingSystem);
            durationUnits.forEach(function (unit) { same(resolved[unit], style); same(resolved[unit + "Display"], "auto"); });
            same("fractionalDigits" in resolved, false);
        });
    });
    test(locale + "/digital", function () {
        var df = new Intl.DurationFormat(locale, {style: "digital"});
        [{hours: 1, minutes: 2, seconds: 3}, {hours: 12, minutes: 34, seconds: 56}, {hours: 0, minutes: 4, seconds: 5}].forEach(function (duration) {
            var expected = reference("duration", {locale: locale, options: {style: "digital"}, duration: duration});
            same(df.format(duration), expected.text);
            var parts = df.formatToParts(duration);
            same(joined(parts), expected.text);
            parts.forEach(function (part) {
                ordinary(part, part.type === "literal" ? ["type", "value"] : ["type", "value", "unit"]);
                assert(part.type === "integer" || part.type === "literal");
                if (part.type === "integer") assert(["hour", "minute", "second"].indexOf(part.unit) !== -1);
            });
        });
        var resolved = df.resolvedOptions();
        same(resolved.minutes, "2-digit");
        same(resolved.seconds, "2-digit");
        ["hours", "minutes", "seconds"].forEach(function (unit) { same(resolved[unit + "Display"], "always"); });
    });
});

durationUnits.forEach(function (unit) {
    ["long", "short", "narrow"].forEach(function (style) {
        test(unit + "/explicit-" + style, function () {
            var options = {style: "long"};
            options[unit] = style;
            var duration = {};
            duration[unit] = 0;
            var df = new Intl.DurationFormat("fr", options);
            var expected = reference("duration", {locale: "fr", options: options, duration: duration});
            same(df.format(duration), expected.text);
            equal(df.formatToParts(duration), expected.parts);
            same(df.resolvedOptions()[unit], style);
            same(df.resolvedOptions()[unit + "Display"], "always");
        });
    });
    rejectsOption("DurationFormat", unit + "Display", ["", "never", null]);
    rejectsOption("DurationFormat", unit, ["", "wide", null]);
});

optionValues("DurationFormat", "style", ["long", "short", "narrow", "digital"]);
rejectsOption("DurationFormat", "style", ["", "numeric", null]);
rejectsOption("DurationFormat", "fractionalDigits", [-1, 10, NaN, Infinity]);
rejectsOption("DurationFormat", "numberingSystem", ["", "a", "abcdefghi", "latn_"]);

test("fractional-seconds-and-numeric-unit-options", function () {
    [0, 1, 3, 6, 9].forEach(function (digits) {
        var df = new Intl.DurationFormat("en", {style: "digital", fractionalDigits: digits});
        var duration = {seconds: 1, milliseconds: 234, microseconds: 567, nanoseconds: 891};
        var parts = df.formatToParts(duration);
        same(joined(parts), df.format(duration));
        same(df.resolvedOptions().fractionalDigits, digits);
        var expected = reference("number", {locale: "en", options: {minimumIntegerDigits: 2, minimumFractionDigits: digits, maximumFractionDigits: digits, roundingMode: "trunc", useGrouping: false}, decimal: "1.234567891"});
        var seconds = parts.filter(function (part) { return part.unit === "second"; });
        same(joined(seconds), expected.text);
    });
    ["hours", "minutes", "seconds"].forEach(function (unit) {
        ["numeric", "2-digit"].forEach(function (style) {
            var options = {};
            options[unit] = style;
            same(new Intl.DurationFormat("en", options).resolvedOptions()[unit], style);
        });
    });
    throws(RangeError, function () { new Intl.DurationFormat("en", {hours: "numeric", minutes: "long"}); });
    throws(RangeError, function () { new Intl.DurationFormat("en", {seconds: "numeric", milliseconds: "long"}); });
    ["years", "months", "weeks", "days"].forEach(function (unit) { var options = {}; options[unit] = "numeric"; throws(RangeError, function () { new Intl.DurationFormat("en", options); }); });
});

test("duration-record-validation-and-property-order", function () {
    var df = new Intl.DurationFormat("en");
    ["format", "formatToParts"].forEach(function (method) {
        [undefined, null, true, 1, Symbol(), {}].forEach(function (value) { throws(TypeError, function () { df[method](value); }); });
        ["PT1S", ""].forEach(function (value) { throws(RangeError, function () { df[method](value); }); });
        [1.5, NaN, Infinity, -Infinity].forEach(function (value) { throws(RangeError, function () { df[method]({seconds: value}); }); });
        throws(RangeError, function () { df[method]({hours: 1, minutes: -1}); });
        ["years", "months", "weeks"].forEach(function (unit) { var duration = {}; duration[unit] = Math.pow(2, 32); throws(RangeError, function () { df[method](duration); }); });
        throws(RangeError, function () { df[method]({seconds: Math.pow(2, 53)}); });
        throws(TypeError, function () { df[method]({seconds: Symbol()}); });
        if (typeof BigInt === "function") throws(TypeError, function () { df[method]({seconds: BigInt(1)}); });
        var log = [];
        var duration = new Proxy({seconds: 1}, {get: function (object, key) { log.push(key); return object[key]; }});
        df[method](duration);
        equal(log, ["days", "hours", "microseconds", "milliseconds", "minutes", "months", "nanoseconds", "seconds", "weeks", "years"]);
        abrupt(function (sentinel) { df[method]({get seconds() { throw sentinel; }}); });
    });
    same(df.format({seconds: "1"}), df.format({seconds: 1}));
    same(df.format(Object.create({seconds: 1})), df.format({seconds: 1}));
    abrupt(function (sentinel) { new Intl.DurationFormat("en", {get hoursDisplay() { throw sentinel; }}); });
});
