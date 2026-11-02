#include "QJSEnginePolyfillIntl.h"

#include <QFile>
#include <QJSEngine>

#include "IntlBridge.h"

namespace QJSEnginePolyfills {

    namespace {

        constexpr auto IntlResourcePath = ":/qjsenginepolyfills/intl/intl.js";

    }

    QJSValue Intl::create(QJSEngine *engine) {
        if (!engine) {
            return {};
        }

        const QString resourcePath = QString::fromLatin1(IntlResourcePath);
        QFile file(resourcePath);
        if (!file.open(QIODevice::ReadOnly)) {
            engine->throwError(QJSValue::TypeError, QStringLiteral("Failed to open the embedded Intl implementation: %1").arg(file.errorString()));
            return {};
        }

        const QJSValue factory = engine->evaluate(QString::fromUtf8(file.readAll()), resourcePath);
        if (engine->hasError()) {
            return factory;
        }
        if (!factory.isCallable()) {
            engine->throwError(QJSValue::TypeError, QStringLiteral("The embedded Intl implementation did not return a factory function."));
            return {};
        }

        auto *bridge = new Internal::IntlBridge(engine);
        const QJSValue intl = factory.call({engine->newQObject(bridge)});
        if (engine->hasError()) {
            return intl;
        }
        if (!intl.isObject()) {
            engine->throwError(QJSValue::TypeError, QStringLiteral("The embedded Intl implementation did not return an Intl object."));
            return {};
        }

        return intl;
    }

    void Intl::install(QJSEngine *engine, const QString &name) {
        if (!engine) {
            return;
        }

        const QJSValue intl = create(engine);
        if (!intl.isObject() || engine->hasError()) {
            return;
        }

        engine->globalObject().setProperty(name, intl);
    }

}
