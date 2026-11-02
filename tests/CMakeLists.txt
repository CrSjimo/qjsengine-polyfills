find_package(Qt6 REQUIRED COMPONENTS Core Qml Test)

set(CMAKE_AUTOMOC ON)

function(qjsenginepolyfills_add_qt_test target)
    add_executable(${target}
        ${ARGN}
    )

    target_compile_features(${target} PRIVATE cxx_std_20)

    target_link_libraries(${target} PRIVATE
        QJSEnginePolyfills::Intl
        Qt6::Core
        Qt6::Qml
        Qt6::Test
    )

    add_test(NAME ${target} COMMAND ${target})
endfunction()

add_subdirectory(intl)
