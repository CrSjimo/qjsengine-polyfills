"use strict";

// ECMA-402 §§6–9; test262/test/intl402/{getCanonicalLocales,supportedValuesOf}.
["EN-us", "zh-hans-cn", "sr-cyrl-rs", "iw-IL", "sh", "de-u-nu-latn-ca-gregory", "en-u-ca-islamicc", "en-u-foo-bar-foo-nu-latn-nu-thai", "en-u-kn-true", "en-t-en-us", "sl-rozaj-biske-1994", "en-x-private"].forEach(function (tag) {
    test("canonical/" + tag, function () {
        equal(Intl.getCanonicalLocales(tag), [reference("canonical", {tag: tag})]);
    });
});

test("canonical/list-deduplication-and-order", function () {
    var input = ["EN-us", "fr", "en-US", "FR", "de"];
    var expected = [];
    input.forEach(function (tag) {
        var canonical = reference("canonical", {tag: tag});
        if (expected.indexOf(canonical) === -1) expected.push(canonical);
    });
    equal(Intl.getCanonicalLocales(input), expected);
    equal(input, ["EN-us", "fr", "en-US", "FR", "de"]);
});

test("canonical/array-like-and-prototype-properties", function () {
    var list = Object.create({1: "de"});
    list[0] = {toString: function () { return "EN-us"; }};
    list[3] = "fr";
    list.length = {valueOf: function () { return 3.9; }};
    equal(Intl.getCanonicalLocales(list), [reference("canonical", {tag: "EN-us"}), reference("canonical", {tag: "de"})]);
    equal(Intl.getCanonicalLocales({length: -1, 0: "invalid_ignored"}), []);
    equal(Intl.getCanonicalLocales({}), []);
    equal(Intl.getCanonicalLocales(undefined), []);
    equal(Intl.getCanonicalLocales(1), []);
    equal(Intl.getCanonicalLocales(true), []);
    equal(Intl.getCanonicalLocales(Symbol()), []);
});

test("canonical/boxed-string-is-array-like", function () {
    throws(RangeError, function () { Intl.getCanonicalLocales(new String("en")); });
});

test("canonical/locale-object-and-coercion-order", function () {
    equal(Intl.getCanonicalLocales(new Intl.Locale("EN-us")), [reference("canonical", {tag: "EN-us"})]);
    var loc = new Intl.Locale("de-DE");
    loc.toString = function () { throw new Error("Locale internal slots must bypass toString"); };
    equal(Intl.getCanonicalLocales(loc), [reference("canonical", {tag: "de-DE"})]);
    equal(Intl.getCanonicalLocales([loc]), [reference("canonical", {tag: "de-DE"})]);
    same(new Intl.Locale(loc).toString(), reference("canonical", {tag: "de-DE"}));
    var log = [];
    var list = new Proxy({length: 2, 0: {toString: function () { log.push("string"); return "en"; }}}, {
        get: function (target, key) { log.push("get:" + String(key)); return target[key]; },
        has: function (target, key) { log.push("has:" + String(key)); return key in target; }
    });
    Intl.getCanonicalLocales(list);
    equal(log, ["get:length", "has:0", "get:0", "string", "has:1"]);
});

invalidTags.forEach(function (tag, index) {
    test("canonical/invalid-tag/" + index, function () { throws(RangeError, function () { Intl.getCanonicalLocales(tag); }); });
});

[undefined, null, true, 1, Symbol()].forEach(function (element, index) {
    test("canonical/invalid-element/" + index, function () { throws(TypeError, function () { Intl.getCanonicalLocales([element]); }); });
});

test("canonical/abrupt-completions", function () {
    throws(TypeError, function () { Intl.getCanonicalLocales(null); });
    abrupt(function (sentinel) { Intl.getCanonicalLocales({get length() { throw sentinel; }}); });
    abrupt(function (sentinel) { Intl.getCanonicalLocales({length: 1, get 0() { throw sentinel; }}); });
    abrupt(function (sentinel) { Intl.getCanonicalLocales([{toString: function () { throw sentinel; }}]); });
    abrupt(function (sentinel) { Intl.getCanonicalLocales(new Proxy({length: 1}, {has: function () { throw sentinel; }})); });
});

services.forEach(function (name) {
    ["lookup", "best fit"].forEach(function (matcher) {
        test(name + "/supportedLocalesOf/" + matcher, function () {
            var locales = ["EN-us", "de-DE", "en-US", "zz-ZZ", "en-US-u-nu-thai"];
            var result = Intl[name].supportedLocalesOf(locales, {localeMatcher: matcher});
            assert(Array.isArray(result));
            if (matcher === "lookup") equal(result, reference("supportedLocales", {service: name, locales: locales}));
            else {
                equal(result.slice(0, 2), [reference("canonical", {tag: "EN-us"}), reference("canonical", {tag: "de-DE"})]);
                same(result.indexOf("zz-ZZ"), -1);
                same(new Set(result).size, result.length);
            }
            equal(Intl[name].supportedLocalesOf(), []);
            equal(Intl[name].supportedLocalesOf([]), []);
            assert(result !== Intl[name].supportedLocalesOf(locales, {localeMatcher: matcher}));
        });
    });

    test(name + "/locale-and-options-errors", function () {
        invalidTags.forEach(function (tag) {
            throws(RangeError, function () { construct(name, tag); });
            throws(RangeError, function () { Intl[name].supportedLocalesOf(tag); });
        });
        throws(TypeError, function () { construct(name, null); });
        throws(TypeError, function () { Intl[name].supportedLocalesOf(null); });
        throws(TypeError, function () { construct(name, "en", null); });
        throws(TypeError, function () { Intl[name].supportedLocalesOf("en", null); });
        throws(RangeError, function () { construct(name, "en", {localeMatcher: "invalid", type: "language"}); });
        throws(RangeError, function () { Intl[name].supportedLocalesOf("en", {localeMatcher: "invalid"}); });
        abrupt(function (sentinel) { construct(name, "en", {get localeMatcher() { throw sentinel; }}); });
        abrupt(function (sentinel) { Intl[name].supportedLocalesOf("en", {get localeMatcher() { throw sentinel; }}); });
    });

    test(name + "/default-and-lookup-resolution", function () {
        var defaultLocale = reference("defaults").locale;
        var options = {localeMatcher: "lookup"};
        if (name === "DisplayNames") options.type = "language";
        var expected = construct(name, defaultLocale, options).resolvedOptions().locale;
        same(construct(name, undefined).resolvedOptions().locale, expected);
        same(construct(name, [], options).resolvedOptions().locale, expected);
        same(construct(name, ["zz-ZZ", "de-DE"], options).resolvedOptions().locale, construct(name, "de-DE", options).resolvedOptions().locale);
        same(construct(name, ["de-DE", "en-US"], options).resolvedOptions().locale, construct(name, "de-DE", options).resolvedOptions().locale);
        equal(construct(name, new Intl.Locale("de-DE")).resolvedOptions(), construct(name, "de-DE").resolvedOptions());
    });
});

["calendar", "collation", "currency", "numberingSystem", "timeZone", "unit"].forEach(function (key) {
    test("supportedValuesOf/" + key, function () {
        var values = Intl.supportedValuesOf(key);
        assert(Array.isArray(values));
        assert(values.length > 0);
        equal(values, values.slice().sort());
        same(new Set(values).size, values.length);
        values.forEach(function (value) { same(typeof value, "string"); });
        equal(values, reference("supportedValues", {key: key}));
        values.pop();
        assert(Intl.supportedValuesOf(key).length > values.length);
        equal(Intl.supportedValuesOf({toString: function () { return key; }}), reference("supportedValues", {key: key}));
    });
});

test("supportedValuesOf/errors", function () {
    [undefined, null, "", "Calendar", "locale", "timezone", 1].forEach(function (key) {
        throws(RangeError, function () { Intl.supportedValuesOf(key); });
    });
    throws(TypeError, function () { Intl.supportedValuesOf(Symbol()); });
    abrupt(function (sentinel) { Intl.supportedValuesOf({toString: function () { throw sentinel; }}); });
});

test("supportedValuesOf/normative-inventories", function () {
    // ECMA-402 Table 30 identifiers; the corresponding digit data is obtained only from ICU.
    var mandatory = "adlm ahom arab arabext bali beng bhks brah cakm cham deva diak fullwide gara gong gonm gujr gukh guru hanidec hmng hmnp java kali kawi khmr knda krai lana lanatham laoo latn lepc limb mathbold mathdbl mathmono mathsanb mathsans mlym modi mong mroo mtei mymr mymrepka mymrpao mymrshan mymrtlng nagm newa nkoo olck onao orya osma outlined rohg saur segment shrd sind sinh sora sund sunu takr talu tamldec telu thai tibt tirh tnsa tols vaii wara wcho".split(" ");
    var systems = Intl.supportedValuesOf("numberingSystem");
    mandatory.forEach(function (name) { assert(systems.indexOf(name) !== -1, "Missing mandatory numbering system " + name); });
    var calendars = Intl.supportedValuesOf("calendar");
    assert(calendars.indexOf("iso8601") !== -1);
    same(calendars.indexOf("islamicc") !== -1, calendars.indexOf("islamic-civil") !== -1);
    var collations = Intl.supportedValuesOf("collation");
    same(collations.indexOf("standard"), -1);
    same(collations.indexOf("search"), -1);
    Intl.supportedValuesOf("currency").forEach(function (code) { assert(/^[A-Z]{3}$/.test(code)); });
    assert(Intl.supportedValuesOf("timeZone").indexOf("UTC") !== -1);
});
