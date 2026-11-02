"use strict";

// ECMA-402 §19; test262/test/intl402/Segmenter, Segments and SegmentIterator.
localeInputs.concat(["th", "km"]).forEach(function (locale) {
    ["grapheme", "word", "sentence"].forEach(function (granularity) {
        test(locale + "/" + granularity, function () {
            var segmenter = new Intl.Segmenter(locale, {granularity: granularity});
            // Input samples exercise combining marks, ZWJ, surrogate pairs, CRLF and dictionary breaks.
            ["", "Hello, world! Next sentence.", "a\u0301\ud83d\udc69\u200d\ud83d\udcbb\ud83c\udde8\ud83c\uddf3\r\nb", "\u4e2d\u6587\u5206\u8bcd\u3002", "\u0e20\u0e32\u0e29\u0e32\u0e44\u0e17\u0e22", "a\ud800b\udc00c"].forEach(function (input) {
                var segments = segmenter.segment(input);
                var actual = Array.from(segments);
                var expected = reference("segments", {locale: locale, granularity: granularity, input: input});
                equal(actual, expected);
                same(actual.map(function (part) { return part.segment; }).join(""), input);
                actual.forEach(function (part) {
                    ordinary(part, granularity === "word" ? ["segment", "index", "input", "isWordLike"] : ["segment", "index", "input"]);
                    for (var index = part.index; index < part.index + part.segment.length; ++index) equal(segments.containing(index), part);
                });
                same(segments.containing(-1), undefined);
                same(segments.containing(input.length), undefined);
                same(segments.containing(Infinity), undefined);
                same(segments.containing(-Infinity), undefined);
                equal(segments.containing(NaN), actual[0]);
                if (input.length) equal(segments.containing("0.9"), actual[0]);
                equal(Array.from(segments), actual);
                var iterator = segments[Symbol.iterator]();
                same(iterator[Symbol.iterator](), iterator);
                actual.forEach(function (part) { var next = iterator.next(); ordinary(next, ["value", "done"]); same(next.done, false); equal(next.value, part); });
                equal(iterator.next(), {value: undefined, done: true});
                equal(iterator.next(), {value: undefined, done: true});
                var other = segments[Symbol.iterator]();
                if (actual.length) same(other.next().done, false);
            });
            ordinary(segmenter.resolvedOptions(), ["locale", "granularity"]);
            same(segmenter.resolvedOptions().granularity, granularity);
        });
    });
});

optionValues("Segmenter", "granularity", ["grapheme", "word", "sentence"]);
rejectsOption("Segmenter", "granularity", ["", "line", null]);

test("segments-and-iterator-prototypes", function () {
    var segments = new Intl.Segmenter("en").segment("ab");
    var prototype = Object.getPrototypeOf(segments);
    builtin(prototype, "containing", 1);
    var iteratorDescriptor = Object.getOwnPropertyDescriptor(prototype, Symbol.iterator);
    same(typeof iteratorDescriptor.value, "function");
    dataProperty(prototype, Symbol.iterator, iteratorDescriptor.value);
    dataProperty(iteratorDescriptor.value, "name", "[Symbol.iterator]", false);
    dataProperty(iteratorDescriptor.value, "length", 0, false);
    same(Object.getPrototypeOf(prototype), Object.prototype);
    [undefined, null, {}, prototype, new Proxy(segments, {})].forEach(function (receiver) {
        throws(TypeError, function () { prototype.containing.call(receiver, 0); });
        throws(TypeError, function () { prototype[Symbol.iterator].call(receiver); });
    });
    var iterator = segments[Symbol.iterator]();
    var iteratorPrototype = Object.getPrototypeOf(iterator);
    builtin(iteratorPrototype, "next", 0);
    dataProperty(iteratorPrototype, Symbol.toStringTag, "Segmenter String Iterator", false);
    [undefined, null, {}, iteratorPrototype, new Proxy(iterator, {})].forEach(function (receiver) { throws(TypeError, function () { iteratorPrototype.next.call(receiver); }); });
    var first = segments.containing(0);
    assert(first !== segments.containing(0));
    first.segment = "mutated";
    same(segments.containing(0).segment, "a");
});

test("input-and-index-coercion", function () {
    var segmenter = new Intl.Segmenter("en");
    equal(Array.from(segmenter.segment()), Array.from(segmenter.segment("undefined")));
    equal(Array.from(segmenter.segment(null)), Array.from(segmenter.segment("null")));
    throws(TypeError, function () { segmenter.segment(Symbol()); });
    throws(TypeError, function () { segmenter.segment("a").containing(Symbol()); });
    abrupt(function (sentinel) { segmenter.segment({toString: function () { throw sentinel; }}); });
    abrupt(function (sentinel) { segmenter.segment("a").containing({valueOf: function () { throw sentinel; }}); });
});
