"use strict";

// Observable Get/GetOption order and abrupt completions, following Test262's property-bag tests.
var digitOptionOrder = ["minimumIntegerDigits", "minimumFractionDigits", "maximumFractionDigits", "minimumSignificantDigits", "maximumSignificantDigits", "roundingIncrement", "roundingMode", "roundingPriority", "trailingZeroDisplay"];
var optionOrder = {
    NumberFormat: ["localeMatcher", "numberingSystem", "style", "currency", "currencyDisplay", "currencySign", "unit", "unitDisplay", "notation"].concat(digitOptionOrder, ["compactDisplay", "useGrouping", "signDisplay"]),
    PluralRules: ["localeMatcher", "type", "notation", "compactDisplay"].concat(digitOptionOrder),
    Collator: ["usage", "localeMatcher", "collation", "numeric", "caseFirst", "sensitivity", "ignorePunctuation"],
    DateTimeFormat: ["localeMatcher", "calendar", "numberingSystem", "hour12", "hourCycle", "timeZone", "weekday", "era", "year", "month", "day", "dayPeriod", "hour", "minute", "second", "fractionalSecondDigits", "timeZoneName", "formatMatcher", "dateStyle", "timeStyle"],
    RelativeTimeFormat: ["localeMatcher", "numberingSystem", "style", "numeric"],
    ListFormat: ["localeMatcher", "type", "style"],
    DisplayNames: ["localeMatcher", "style", "type", "fallback", "languageDisplay"],
    Segmenter: ["localeMatcher", "granularity"],
    DurationFormat: ["localeMatcher", "numberingSystem", "style"].concat(["years", "months", "weeks", "days", "hours", "minutes", "seconds", "milliseconds", "microseconds", "nanoseconds"].reduce(function (list, unit) { return list.concat([unit, unit + "Display"]); }, []), ["fractionalDigits"])
};

Object.keys(optionOrder).forEach(function (name) {
    test(name + "/option-access-order", function () {
        var log = [];
        var values = name === "DisplayNames" ? {type: "language"} : {};
        var options = new Proxy(values, {get: function (object, key) { log.push(key); return object[key]; }});
        new Intl[name]("en", options);
        equal(log, optionOrder[name]);
    });
    optionOrder[name].forEach(function (property) {
        test(name + "/abrupt-option/" + property, function () {
            abrupt(function (sentinel) {
                var values = name === "DisplayNames" ? {type: "language"} : {};
                Object.defineProperty(values, property, {get: function () { throw sentinel; }});
                new Intl[name]("en", values);
            });
        });
    });
});

services.forEach(function (name) {
    test(name + "/inherited-options-and-single-read", function () {
        var calls = 0;
        var options = Object.create(name === "DisplayNames" ? {localeMatcher: "lookup", type: "language"} : {localeMatcher: "lookup"});
        Object.defineProperty(options, "localeMatcher", {get: function () { ++calls; return "lookup"; }});
        construct(name, "en", options);
        same(calls, 1);
        calls = 0;
        Intl[name].supportedLocalesOf("en", options);
        same(calls, 1);
    });
    test(name + "/canonicalization-before-options", function () {
        var calls = 0;
        var options = {get localeMatcher() { ++calls; return "lookup"; }};
        throws(RangeError, function () { construct(name, "bad_tag", options); });
        same(calls, 0);
        throws(RangeError, function () { Intl[name].supportedLocalesOf("bad_tag", options); });
        same(calls, 0);
    });
    test(name + "/primitive-options", function () {
        [true, 1, "", Symbol()].forEach(function (options) {
            if (["Collator", "DateTimeFormat", "NumberFormat", "PluralRules", "RelativeTimeFormat"].indexOf(name) !== -1) {
                equal(construct(name, "en", options).resolvedOptions(), construct(name, "en").resolvedOptions());
            } else throws(TypeError, function () { new Intl[name]("en", options); });
            equal(Intl[name].supportedLocalesOf("en", options), Intl[name].supportedLocalesOf("en"));
        });
    });
});
