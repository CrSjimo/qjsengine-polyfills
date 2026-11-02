"use strict";

// ECMA-402 §15; test262/test/intl402/Locale (including Locale-info and Locale-variants).
["en", "EN-us", "zh-Hant-TW", "sr-Cyrl-RS", "und", "sl-rozaj-biske-1994", "de-u-ca-gregory-co-phonebk-hc-h23-kf-upper-kn-nu-latn", "en-x-private"].forEach(function (tag) {
    [{}, {language: "fr", script: "Latn", region: "CA"}, {calendar: "buddhist", collation: "emoji", numberingSystem: "thai", hourCycle: "h24", caseFirst: "lower", numeric: false}, {variants: "fonipa"}, {firstDayOfWeek: "mon"}].forEach(function (options, index) {
        test(tag + "/properties/" + index, function () {
            var loc = new Intl.Locale(tag, options);
            var expected = reference("localeProperties", {tag: tag, options: options});
            same(loc.toString(), expected.tag);
            same(String(loc), expected.tag);
            ["baseName", "language", "script", "region", "variants", "calendar", "collation", "hourCycle", "caseFirst", "numeric", "numberingSystem", "firstDayOfWeek"].forEach(function (property) { same(loc[property], expected[property], property); });
            var maximal = loc.maximize();
            var minimal = loc.minimize();
            same(maximal.toString(), expected.maximize);
            same(minimal.toString(), expected.minimize);
            same(Object.getPrototypeOf(maximal), Intl.Locale.prototype);
            same(Object.getPrototypeOf(minimal), Intl.Locale.prototype);
            assert(maximal !== loc && minimal !== loc);
            same(loc.toString(), expected.tag);
            same(new Intl.Locale(loc).toString(), loc.toString());
        });
    });
});

localeInputs.concat(["en", "ar", "en-US-u-fw-mon", "en-US-u-ca-buddhist-co-emoji-hc-h24-nu-thai"]).forEach(function (tag) {
    test(tag + "/locale-info", function () {
        var loc = new Intl.Locale(tag);
        var expected = reference("localeInfo", {tag: tag});
        [["getCalendars", "calendars"], ["getCollations", "collations"], ["getNumberingSystems", "numberingSystems"], ["getTimeZones", "timeZones"], ["getTextInfo", "textInfo"], ["getWeekInfo", "weekInfo"]].forEach(function (entry) {
            var first = loc[entry[0]]();
            equal(first, expected[entry[1]], entry[0]);
            if (first !== undefined) {
                assert(first !== loc[entry[0]]());
                if (Array.isArray(first)) first.pop();
                else first.changed = true;
                equal(loc[entry[0]](), expected[entry[1]]);
            }
        });
        var cycles = loc.getHourCycles();
        assert(Array.isArray(cycles) && cycles.length > 0);
        same(cycles[0], expected.preferredHourCycle);
        same(new Set(cycles).size, cycles.length);
        cycles.forEach(function (cycle) { assert(["h11", "h12", "h23", "h24"].indexOf(cycle) !== -1); });
        assert(cycles !== loc.getHourCycles());
        ordinary(loc.getTextInfo(), ["direction"]);
        ordinary(loc.getWeekInfo(), ["firstDay", "weekend"]);
    });
});

test("extension-options-and-unknown-well-formed-values", function () {
    var loc = new Intl.Locale("en-u-ca-gregory-co-phonebk-fw-sun-hc-h12-kf-upper-kn-nu-latn", {calendar: "buddhist", collation: "emoji", firstDayOfWeek: 1, hourCycle: "h23", caseFirst: "lower", numeric: false, numberingSystem: "thai"});
    same(loc.calendar, "buddhist");
    same(loc.collation, "emoji");
    same(loc.firstDayOfWeek, "mon");
    same(loc.hourCycle, "h23");
    same(loc.caseFirst, "lower");
    same(loc.numeric, false);
    same(loc.numberingSystem, "thai");
    equal(loc.getCalendars(), ["buddhist"]);
    equal(loc.getCollations(), ["emoji"]);
    equal(loc.getHourCycles(), ["h23"]);
    equal(loc.getNumberingSystems(), ["thai"]);
    ["calendar", "collation", "numberingSystem"].forEach(function (property) { var options = {}; options[property] = "foobar"; same(new Intl.Locale("en", options)[property], "foobar"); });
    same(new Intl.Locale("en", {numeric: {}}).numeric, true);
    var first = loc.getWeekInfo();
    first.weekend.pop();
    equal(loc.getWeekInfo(), reference("localeInfo", {tag: loc.toString()}).weekInfo);
});

test("validation-and-coercion-order", function () {
    invalidTags.forEach(function (tag) { throws(RangeError, function () { new Intl.Locale(tag); }); });
    [undefined, null, true, 1, Symbol()].forEach(function (tag) { throws(TypeError, function () { new Intl.Locale(tag); }); });
    throws(TypeError, function () { new Intl.Locale("en", null); });
    same(new Intl.Locale({toString: function () { return "EN-us"; }}).toString(), reference("canonical", {tag: "EN-us"}));
    abrupt(function (sentinel) { new Intl.Locale({toString: function () { throw sentinel; }}); });
    abrupt(function (sentinel) { new Intl.Locale("en", {get language() { throw sentinel; }}); });
    var order = [];
    new Intl.Locale("en", new Proxy({}, {get: function (object, key) { order.push(key); return undefined; }}));
    equal(order, ["language", "script", "region", "variants", "calendar", "collation", "firstDayOfWeek", "hourCycle", "caseFirst", "numeric", "numberingSystem"]);
});

rejectsOption("Locale", "language", ["", "e", "abcd", "en-US", "123"]);
rejectsOption("Locale", "script", ["", "Lat", "Latin", "1234"]);
rejectsOption("Locale", "region", ["", "U", "USA", "1234"]);
rejectsOption("Locale", "variants", ["", "abc", "1996-1996", "fonipa_fonupa"]);
rejectsOption("Locale", "hourCycle", ["", "h13", null]);
rejectsOption("Locale", "caseFirst", ["", "true", null]);
["calendar", "collation", "numberingSystem", "firstDayOfWeek"].forEach(function (property) { rejectsOption("Locale", property, ["", "a", "abcdefghi", "foo_bar"]); });
