#include "IntlTestOracle.h"

#include <QFile>
#include <QJSEngine>
#include <QJSEnginePolyfillIntl/QJSEnginePolyfillIntl.h>
#include <QStringList>
#include <QTest>

#include <memory>

namespace {

    const QStringList suites = {
        QStringLiteral("infrastructure"), QStringLiteral("structure"), QStringLiteral("locales"), QStringLiteral("collator"),
        QStringLiteral("numberformat"), QStringLiteral("datetimeformat"), QStringLiteral("pluralrules"),
        QStringLiteral("relativetimeformat"), QStringLiteral("listformat"), QStringLiteral("displaynames"),
        QStringLiteral("segmenter"), QStringLiteral("durationformat"), QStringLiteral("locale"),
        QStringLiteral("parameters"), QStringLiteral("builtins")
    };

    QString errorText(const QJSValue &error) {
        return error.toString() + QLatin1Char('\n') + error.property(QStringLiteral("stack")).toString();
    }

    bool loadScript(QJSEngine &engine, const QString &name, QString &error) {
        const QString path = QStringLiteral(":/intl-tests/") + name + QStringLiteral(".js");
        QFile file(path);
        if (!file.open(QIODevice::ReadOnly)) {
            error = path + QStringLiteral(": ") + file.errorString();
            return false;
        }
        const QJSValue result = engine.evaluate(QString::fromUtf8(file.readAll()), path);
        if (result.isError() || engine.hasError()) {
            error = errorText(engine.hasError() ? engine.catchError() : result);
            return false;
        }
        return true;
    }

}

class tst_QJSEnginePolyfills_Intl : public QObject {
    Q_OBJECT

private Q_SLOTS:
    void init();
    void cleanup();
    void oracleCurrencyInterleaving();
    void conformance_data();
    void conformance();

private:
    std::unique_ptr<QJSEngine> m_engine;
};

void tst_QJSEnginePolyfills_Intl::init() {
    m_engine = std::make_unique<QJSEngine>();
    // Always exercise the polyfill, even if a future Qt version supplies native Intl.
    m_engine->globalObject().deleteProperty(QStringLiteral("Intl"));
    QJSEnginePolyfills::Intl::install(m_engine.get());
    if (m_engine->hasError()) {
        QFAIL(qPrintable(errorText(m_engine->catchError())));
    }
    auto *oracle = new IntlTestOracle(m_engine.get());
    QJSEngine::setObjectOwnership(oracle, QJSEngine::CppOwnership);
    m_engine->globalObject().setProperty(QStringLiteral("icuOracle"), m_engine->newQObject(oracle));
}

void tst_QJSEnginePolyfills_Intl::cleanup() {
    m_engine.reset();
}

void tst_QJSEnginePolyfills_Intl::oracleCurrencyInterleaving() {
    QString error;
    QVERIFY2(loadScript(*m_engine, QStringLiteral("harness"), error), qPrintable(error));
    QVERIFY2(loadScript(*m_engine, QStringLiteral("infrastructure"), error), qPrintable(error));
    auto *oracle = qobject_cast<IntlTestOracle *>(m_engine->globalObject().property(QStringLiteral("icuOracle")).toQObject());
    QVERIFY(oracle);
    QJSValue request = m_engine->newObject();
    request.setProperty(QStringLiteral("key"), QStringLiteral("currency"));
    const QJSValue currencies = oracle->query(QStringLiteral("supportedValues"), request);
    if (m_engine->hasError()) QFAIL(qPrintable(errorText(m_engine->catchError())));
    QVERIFY(currencies.isArray());
    const int count = currencies.property(QStringLiteral("length")).toInt();
    QVERIFY(count > 0);
    const QJSValue exercise = m_engine->globalObject().property(QStringLiteral("currencyInterleavingSample"));
    QVERIFY(exercise.isCallable());
    for (int index = 0; index < count; ++index) {
        m_engine->collectGarbage();
        const QJSValue currency = currencies.property(index);
        const QJSValue sample = exercise.call({currency});
        if (m_engine->hasError()) QFAIL(qPrintable(currency.toString() + QLatin1Char('\n') + errorText(m_engine->catchError())));
        QVERIFY2(!sample.isError(), qPrintable(errorText(sample)));
        // QJSValue roots must keep both the formatter state and native oracle tree alive.
        m_engine->collectGarbage();
        const QJSValue expected = sample.property(QStringLiteral("expected"));
        QVERIFY2(expected.property(QStringLiteral("parts")).isArray(), qPrintable(currency.toString()));
        const QJSValue formatter = sample.property(QStringLiteral("formatter"));
        const QJSValue actual = formatter.property(QStringLiteral("format")).call({QJSValue(1.2345)});
        if (m_engine->hasError()) QFAIL(qPrintable(currency.toString() + QLatin1Char('\n') + errorText(m_engine->catchError())));
        QCOMPARE(actual.toString(), expected.property(QStringLiteral("text")).toString());
    }
}

void tst_QJSEnginePolyfills_Intl::conformance_data() {
    QTest::addColumn<QString>("suite");
    QTest::addColumn<int>("index");
    QTest::addColumn<QString>("parameter");
    // Registration never calls the polyfill. Parameterized inventory cases query ICU only.
    for (const QString &suite : suites) {
        QJSEngine registrationEngine;
        IntlTestOracle oracle(&registrationEngine);
        QString error;
        QVERIFY2(loadScript(registrationEngine, QStringLiteral("harness"), error), qPrintable(error));
        QVERIFY2(loadScript(registrationEngine, suite, error), qPrintable(error));
        const QJSValue tests = registrationEngine.globalObject().property(QStringLiteral("intlTests"));
        const int count = tests.property(QStringLiteral("length")).toInt();
        QVERIFY2(count > 0, qPrintable(suite + QStringLiteral(": no test cases registered")));
        for (int index = 0; index < count; ++index) {
            const QJSValue test = tests.property(index);
            const QString name = suite + QLatin1Char('/') + test.property(QStringLiteral("name")).toString();
            const QJSValue source = test.property(QStringLiteral("data"));
            if (!source.isObject()) {
                QTest::newRow(qPrintable(name)) << suite << index << QString();
                continue;
            }
            const QJSValue values = oracle.query(source.property(QStringLiteral("operation")).toString(), source.property(QStringLiteral("request")));
            if (registrationEngine.hasError()) {
                QFAIL(qPrintable(errorText(registrationEngine.catchError())));
            }
            QVERIFY2(values.isArray(), qPrintable(name + QStringLiteral(": the inventory must be a native JS array")));
            const int size = values.property(QStringLiteral("length")).toInt();
            QVERIFY2(size > 0, qPrintable(name + QStringLiteral(": empty inventory")));
            for (int item = 0; item < size; ++item) {
                const QJSValue value = values.property(item);
                QVERIFY2(value.isString(), qPrintable(name + QStringLiteral(": inventory entries must be strings")));
                const QString parameter = value.toString();
                QTest::newRow(qPrintable(name + QLatin1Char('/') + parameter)) << suite << index << parameter;
            }
        }
    }
}

void tst_QJSEnginePolyfills_Intl::conformance() {
    QFETCH(QString, suite);
    QFETCH(int, index);
    QFETCH(QString, parameter);
    QString error;
    QVERIFY2(loadScript(*m_engine, QStringLiteral("harness"), error), qPrintable(error));
    QVERIFY2(loadScript(*m_engine, suite, error), qPrintable(error));
    const QJSValue test = m_engine->globalObject().property(QStringLiteral("intlTests")).property(index);
    const QJSValue body = test.property(QStringLiteral("body"));
    QVERIFY2(body.isCallable(), "The registered test body must be callable");
    const QJSValueList arguments = test.property(QStringLiteral("data")).isObject() ? QJSValueList{QJSValue(parameter)} : QJSValueList{};
    const QJSValue result = body.call(arguments);
    if (m_engine->hasError()) {
        QFAIL(qPrintable(errorText(m_engine->catchError())));
    }
    QVERIFY2(!result.isError(), qPrintable(errorText(result)));
}

QTEST_GUILESS_MAIN(tst_QJSEnginePolyfills_Intl)

#include "tst_QJSEnginePolyfills_Intl.moc"
