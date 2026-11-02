#ifndef QJSENGINEPOLYFILLINTL_H
#define QJSENGINEPOLYFILLINTL_H

#include "QJSEnginePolyfillIntlGlobal.h"

#include <QJSValue>
#include <QString>

class QJSEngine;

namespace QJSEnginePolyfills {

    class QJSENGINE_POLYFILLS_INTL_EXPORT Intl {
    public:
        static QJSValue create(QJSEngine *engine);
        static void install(QJSEngine *engine, const QString &name = QStringLiteral("Intl"));
    };

}

#endif // QJSENGINEPOLYFILLINTL_H
