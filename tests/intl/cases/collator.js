"use strict";

// ECMA-402 §10; test262/test/intl402/Collator.
localeInputs.forEach(function (locale) {
    [{}, {sensitivity: "base"}, {sensitivity: "accent"}, {sensitivity: "case"}, {sensitivity: "variant"}, {numeric: true}, {numeric: false}, {caseFirst: "upper"}, {caseFirst: "lower"}, {ignorePunctuation: true}, {usage: "search", sensitivity: "base"}].forEach(function (options, index) {
        test(locale + "/comparison/" + index, function () {
            var collator = new Intl.Collator(locale, options);
            [["a", "A"], ["a", "\u00e4"], ["\u00e4", "z"], ["2", "10"], ["a-b", "ab"], ["\u00e9", "e\u0301"], ["", "a"], ["\ud83d\ude00", "\ud83d\ude01"]].forEach(function (pair) {
                var actual = collator.compare(pair[0], pair[1]);
                var expected = reference("collate", {locale: locale, options: options, left: pair[0], right: pair[1]});
                same(Math.sign(actual) || 0, expected, "Comparison sign");
                same(Math.sign(collator.compare(pair[1], pair[0])) || 0, -expected || 0);
                same(collator.compare(pair[0], pair[0]), 0);
            });
        });
    });
});

optionValues("Collator", "usage", ["sort", "search"]);
optionValues("Collator", "sensitivity", ["base", "accent", "case", "variant"]);
optionValues("Collator", "caseFirst", ["upper", "lower", "false"]);
rejectsOption("Collator", "usage", ["", "SORT", null]);
rejectsOption("Collator", "sensitivity", ["", "primary", null]);
rejectsOption("Collator", "caseFirst", ["", "true", null]);
rejectsOption("Collator", "collation", ["", "a", "abcdefghi", "a_b"]);

test("resolvedOptions-and-extension-precedence", function () {
    var result = new Intl.Collator("de-u-kn-true-kf-upper", {numeric: false, caseFirst: "lower", sensitivity: "case", ignorePunctuation: true}).resolvedOptions();
    ordinary(result, ["locale", "usage", "sensitivity", "ignorePunctuation", "collation", "numeric", "caseFirst"]);
    same(result.numeric, false);
    same(result.caseFirst, "lower");
    same(result.sensitivity, "case");
    same(result.ignorePunctuation, true);
    same(new Intl.Collator("de-u-kn").resolvedOptions().numeric, true);
    same(new Intl.Collator("de-u-kf-upper").resolvedOptions().caseFirst, "upper");
    same(new Intl.Collator("de", {collation: "foobar"}).resolvedOptions().collation, "default");
});

test("compare-coercion-and-abrupt-completions", function () {
    var compare = new Intl.Collator("en").compare;
    var log = [];
    compare({toString: function () { log.push("left"); return "a"; }}, {toString: function () { log.push("right"); return "b"; }});
    equal(log, ["left", "right"]);
    same(compare(), compare("undefined", "undefined"));
    same(compare(null, 42), compare("null", "42"));
    throws(TypeError, function () { compare(Symbol(), "a"); });
    abrupt(function (sentinel) { compare({toString: function () { throw sentinel; }}, "b"); });
    abrupt(function (sentinel) { new Intl.Collator("en", {get numeric() { throw sentinel; }}); });
    same(new Intl.Collator("en", {numeric: {}}).resolvedOptions().numeric, true);
    same(new Intl.Collator("en", {ignorePunctuation: 0}).resolvedOptions().ignorePunctuation, false);
});
