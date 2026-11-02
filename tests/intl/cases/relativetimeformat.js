"use strict";

// ECMA-402 §18; test262/test/intl402/RelativeTimeFormat.
localeInputs.forEach(function (locale) {
    ["long", "short", "narrow"].forEach(function (style) {
        ["always", "auto"].forEach(function (numeric) {
            test(locale + "/" + style + "/" + numeric, function () {
                var options = {style: style, numeric: numeric};
                var rtf = new Intl.RelativeTimeFormat(locale, options);
                ["year", "quarter", "month", "week", "day", "hour", "minute", "second"].forEach(function (unit) {
                    [-1000, -2, -1, -0, 0, 1, 2, 1.5, 1234.5].forEach(function (value) {
                        var expected = reference("relative", {locale: locale, options: options, value: value, unit: unit});
                        same(rtf.format(value, unit), expected.text);
                        same(rtf.format(value, unit + "s"), expected.text);
                        var parts = rtf.formatToParts(value, unit);
                        checkParts(parts, expected.text, ["literal", "integer", "group", "decimal", "fraction"], false, true);
                        equal(parts, expected.parts);
                    });
                });
                var resolved = rtf.resolvedOptions();
                ordinary(resolved, ["locale", "style", "numeric", "numberingSystem"]);
                same(resolved.style, style);
                same(resolved.numeric, numeric);
                same(resolved.numberingSystem, reference("numberDefaults", {locale: locale}).numberingSystem);
            });
        });
    });
});

optionValues("RelativeTimeFormat", "style", ["long", "short", "narrow"]);
optionValues("RelativeTimeFormat", "numeric", ["always", "auto"]);
rejectsOption("RelativeTimeFormat", "style", ["", "wide", null]);
rejectsOption("RelativeTimeFormat", "numeric", ["", "AUTO", null]);
rejectsOption("RelativeTimeFormat", "numberingSystem", ["", "a", "abcdefghi", "latn_"]);

test("coercion-errors-and-abrupt-completions", function () {
    var rtf = new Intl.RelativeTimeFormat("en");
    ["format", "formatToParts"].forEach(function (method) {
        [NaN, Infinity, -Infinity, undefined].forEach(function (value) { throws(RangeError, function () { rtf[method](value, "day"); }); });
        [undefined, null, "", "Day", "dayss", "millisecond"].forEach(function (unit) { throws(RangeError, function () { rtf[method](1, unit); }); });
        throws(TypeError, function () { rtf[method](Symbol(), "day"); });
        throws(TypeError, function () { rtf[method](1, Symbol()); });
        if (typeof BigInt === "function") throws(TypeError, function () { rtf[method](BigInt(1), "day"); });
        var log = [];
        rtf[method]({valueOf: function () { log.push("number"); return 1; }}, {toString: function () { log.push("unit"); return "day"; }});
        equal(log, ["number", "unit"]);
        abrupt(function (sentinel) { rtf[method](1, {toString: function () { throw sentinel; }}); });
    });
    same(rtf.format("1", "day"), rtf.format(1, "day"));
    same(rtf.format(null, "day"), rtf.format(0, "day"));
    same(new Intl.RelativeTimeFormat("ar-u-nu-arab", {numberingSystem: "latn"}).resolvedOptions().numberingSystem, "latn");
    abrupt(function (sentinel) { new Intl.RelativeTimeFormat("en", {get numeric() { throw sentinel; }}); });
});
