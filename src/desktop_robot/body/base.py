from typing import Protocol

from .types import BodyCommand, BodyResult


class BodyClient(Protocol):
    def execute(self, cmd: BodyCommand) -> BodyResult: ...
