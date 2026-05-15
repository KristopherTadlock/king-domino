from setuptools import Extension, setup

try:
    from Cython.Build import cythonize
except ImportError as exc:
    raise RuntimeError("Cython is required to build the native Kingdomino extension") from exc


extensions = cythonize(
    [
        Extension(
            "ai.puffer_kingdomino.native",
            ["ai/puffer_kingdomino/native.pyx"],
        )
    ],
    compiler_directives={
        "language_level": "3",
        "boundscheck": False,
        "wraparound": False,
        "initializedcheck": False,
    },
)


setup(ext_modules=extensions)

