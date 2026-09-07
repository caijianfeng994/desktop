from .builtin import BUILTIN


def get_skill(name: str):
    return BUILTIN[name]
