"use strict";

test("Intl-object", function () {
    same(typeof Intl, "object");
    same(Object.getPrototypeOf(Intl), Object.prototype);
    same(Object.prototype.toString.call(Intl), "[object Intl]");
    dataProperty(Intl, Symbol.toStringTag, "Intl", false);
    throws(TypeError, function () { Intl(); });
    throws(TypeError, function () { new Intl(); });
    builtin(Intl, "getCanonicalLocales", 1);
    builtin(Intl, "supportedValuesOf", 1);
});

var surface = {
    Collator: {length: 0, methods: {resolvedOptions: 0}, getters: ["compare"]},
    DateTimeFormat: {length: 0, methods: {resolvedOptions: 0, formatToParts: 1, formatRange: 2, formatRangeToParts: 2}, getters: ["format"]},
    DisplayNames: {length: 2, methods: {resolvedOptions: 0, of: 1}},
    DurationFormat: {length: 0, methods: {resolvedOptions: 0, format: 1, formatToParts: 1}},
    ListFormat: {length: 0, methods: {resolvedOptions: 0, format: 1, formatToParts: 1}},
    Locale: {length: 1, methods: {toString: 0, maximize: 0, minimize: 0, getCalendars: 0, getCollations: 0, getHourCycles: 0, getNumberingSystems: 0, getTimeZones: 0, getTextInfo: 0, getWeekInfo: 0}, getters: ["baseName", "calendar", "caseFirst", "collation", "firstDayOfWeek", "hourCycle", "language", "numberingSystem", "numeric", "region", "script", "variants"]},
    NumberFormat: {length: 0, methods: {resolvedOptions: 0, formatToParts: 1, formatRange: 2, formatRangeToParts: 2}, getters: ["format"]},
    PluralRules: {length: 0, methods: {resolvedOptions: 0, select: 1, selectRange: 2}},
    RelativeTimeFormat: {length: 0, methods: {resolvedOptions: 0, format: 2, formatToParts: 2}},
    Segmenter: {length: 0, methods: {resolvedOptions: 0, segment: 1}}
};

Object.keys(surface).forEach(function (name) {
    var spec = surface[name];
    test(name + "/constructor-and-prototype", function () {
        var C = Intl[name];
        same(typeof C, "function");
        dataProperty(Intl, name, C);
        dataProperty(C, "name", name, false);
        dataProperty(C, "length", spec.length, false);
        dataProperty(C, "prototype", C.prototype, false, false);
        same(Object.getPrototypeOf(C), Function.prototype);
        same(Object.getPrototypeOf(C.prototype), Object.prototype);
        dataProperty(C.prototype, "constructor", C);
        dataProperty(C.prototype, Symbol.toStringTag, "Intl." + name, false);
        var instance = construct(name, "en");
        same(Object.getPrototypeOf(instance), C.prototype);
        same(Object.prototype.toString.call(instance), "[object Intl." + name + "]");
        if (name !== "Locale") builtin(C, "supportedLocalesOf", 1);
        if (["Collator", "DateTimeFormat", "NumberFormat"].indexOf(name) !== -1) {
            assert(C("en") instanceof C);
        } else {
            throws(TypeError, function () { C("en", {type: "language"}); });
        }
    });

    test(name + "/subclass-and-newTarget", function () {
        var C = Intl[name];
        class Derived extends C {}
        var instance = name === "DisplayNames" ? new Derived("en", {type: "language"}) : new Derived("en");
        same(Object.getPrototypeOf(instance), Derived.prototype);
        assert(instance instanceof C);
        var customPrototype = {};
        function Target() {}
        Target.prototype = customPrototype;
        var custom = Reflect.construct(C, name === "DisplayNames" ? ["en", {type: "language"}] : ["en"], Target);
        same(Object.getPrototypeOf(custom), customPrototype);
        if (name === "Locale") same(C.prototype.toString.call(custom), reference("canonical", {tag: "en"}));
        else ordinary(C.prototype.resolvedOptions.call(custom));
        Target.prototype = null;
        same(Object.getPrototypeOf(Reflect.construct(C, name === "DisplayNames" ? ["en", {type: "language"}] : ["en"], Target)), C.prototype);
        abrupt(function (sentinel) {
            var target = new Proxy(Target, {get: function (object, key) { if (key === "prototype") throw sentinel; return object[key]; }});
            Reflect.construct(C, name === "DisplayNames" ? ["en", {type: "language"}] : ["en"], target);
        });
    });

    Object.keys(spec.methods).forEach(function (method) {
        test(name + "/method-" + method, function () {
            var prototype = Intl[name].prototype;
            builtin(prototype, method, spec.methods[method]);
            [undefined, null, true, 1, "en", {}, prototype, Object.create(prototype)].forEach(function (receiver) {
                throws(TypeError, function () { prototype[method].call(receiver); });
            });
            var instance = construct(name, "en");
            throws(TypeError, function () { prototype[method].call(new Proxy(instance, {})); });
        });
    });

    (spec.getters || []).forEach(function (property) {
        test(name + "/get-" + property, function () {
            var prototype = Intl[name].prototype;
            var get = getter(prototype, property);
            [undefined, null, {}, prototype, Object.create(prototype), new Proxy(construct(name, "en"), {})].forEach(function (receiver) {
                throws(TypeError, function () { get.call(receiver); });
            });
            var instance = construct(name, "en");
            var first = get.call(instance);
            same(get.call(instance), first, "Cached accessor result");
            if (property === "format" || property === "compare") {
                same(typeof first, "function");
                dataProperty(first, "length", property === "compare" ? 2 : 1, false);
                dataProperty(first, "name", "", false);
                throws(TypeError, function () { new first(); });
                var value = property === "compare" ? ["a", "b"] : [0];
                same(first.apply(null, value), first.apply({}, value), "Bound function ignores this");
                assert(first !== get.call(construct(name, "en")));
            }
        });
    });

    if (name !== "Locale") {
        test(name + "/resolvedOptions-fresh-ordinary-object", function () {
            var instance = construct(name, "en");
            var first = instance.resolvedOptions();
            var second = instance.resolvedOptions();
            ordinary(first);
            equal(first, second);
            assert(first !== second);
            Object.keys(first).forEach(function (key) { first[key] = "mutated"; });
            equal(instance.resolvedOptions(), second);
        });
    }
});

["DateTimeFormat", "NumberFormat"].forEach(function (name) {
    test(name + "/normative-optional-legacy-construction", function () {
        var C = Intl[name];
        var receiver = Object.create(C.prototype);
        var result = C.call(receiver, "en");
        if (result === receiver) {
            var symbols = Object.getOwnPropertySymbols(receiver);
            same(symbols.length, 1);
            dataProperty(receiver, symbols[0], receiver[symbols[0]], false, false);
            equal(receiver.resolvedOptions(), new C("en").resolvedOptions());
            same(receiver.format(0), new C("en").format(0));
            throws(TypeError, function () { receiver.formatToParts(0); });
            throws(TypeError, function () { receiver.formatRange(0, 1); });
            throws(TypeError, function () { C.call(receiver, "en"); });
        } else {
            assert(result instanceof C);
            equal(Object.getOwnPropertySymbols(receiver), []);
            throws(TypeError, function () { receiver.resolvedOptions(); });
        }
    });
});

var partsCalls = [
    {name: "NumberFormat/formatToParts", create: function () { return new Intl.NumberFormat("en"); }, method: "formatToParts", args: [1234.5]},
    {name: "NumberFormat/formatRangeToParts", create: function () { return new Intl.NumberFormat("en"); }, method: "formatRangeToParts", args: [1, 2]},
    {name: "DateTimeFormat/formatToParts", create: function () { return new Intl.DateTimeFormat("en", {timeZone: "UTC"}); }, method: "formatToParts", args: [0]},
    {name: "DateTimeFormat/formatRangeToParts", create: function () { return new Intl.DateTimeFormat("en", {timeZone: "UTC"}); }, method: "formatRangeToParts", args: [0, 86400000]},
    {name: "ListFormat/formatToParts", create: function () { return new Intl.ListFormat("en"); }, method: "formatToParts", args: [["A", "B"]]},
    {name: "RelativeTimeFormat/formatToParts", create: function () { return new Intl.RelativeTimeFormat("en"); }, method: "formatToParts", args: [2, "day"]},
    {name: "DurationFormat/formatToParts", create: function () { return new Intl.DurationFormat("en"); }, method: "formatToParts", args: [{hours: 1, minutes: 2}]}
];

partsCalls.forEach(function (entry) {
    test(entry.name + "/fresh-records", function () {
        var instance = entry.create();
        function invoke() { return instance[entry.method].apply(instance, entry.args); }
        var first = invoke();
        var second = invoke();
        same(Object.getPrototypeOf(first), Array.prototype);
        equal(first, second);
        assert(first !== second && first.length > 0);
        first.forEach(function (part, index) { assert(part !== second[index]); ordinary(part); });
        first[0].value = "mutated";
        first.pop();
        equal(invoke(), second);
    });
});
