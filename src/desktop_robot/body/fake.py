from .types import BodyCommand, BodyResult


class FakeBody:
    def __init__(self, fail_actions: set[str] | None = None) -> None:
        self.history: list[BodyCommand] = []
        self.fail_actions = fail_actions or set()

    def execute(self, cmd: BodyCommand) -> BodyResult:
        self.history.append(cmd)
        if cmd.action in self.fail_actions:
            return BodyResult(ok=False, reason="forced_fail")
        return BodyResult(ok=True)
