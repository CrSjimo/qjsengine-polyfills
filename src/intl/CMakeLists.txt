project(QJSEnginePolyfillIntl
    VERSION ${QJSENGINE_POLYFILLS_VERSION}
    LANGUAGES CXX
)

find_package(Qt6 REQUIRED COMPONENTS Qml)
find_package(ICU REQUIRED COMPONENTS uc i18n data)

file(GLOB_RECURSE _src *.h *.cpp)

qjsenginepolyfills_add_library(${PROJECT_NAME} AUTOGEN
    SOURCES ${_src}
    LINKS ICU::uc ICU::i18n ICU::data
    QT_LINKS Core Qml
    EXPORT_NAME Intl
    PREFIX QJSENGINE_POLYFILLS_INTL
    FEATURES cxx_std_20
)

qt_add_resources(${PROJECT_NAME} intl_resources
    PREFIX "/qjsenginepolyfills/intl"
    BASE "${CMAKE_CURRENT_SOURCE_DIR}"
    FILES "${CMAKE_CURRENT_SOURCE_DIR}/intl.js"
)
