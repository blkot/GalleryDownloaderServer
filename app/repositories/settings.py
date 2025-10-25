from __future__ import annotations

from typing import Dict, Optional

from sqlmodel import Session, select

from app.models.entities import RuntimeSetting


class SettingsRepository:
    """Repository for runtime configuration overrides."""

    def __init__(self, session: Session) -> None:
        self.session = session

    def all(self) -> Dict[str, str]:
        rows = self.session.exec(select(RuntimeSetting)).all()
        return {row.key: row.value for row in rows}

    def get(self, key: str) -> Optional[str]:
        setting = self.session.get(RuntimeSetting, key)
        return setting.value if setting else None

    def upsert(self, key: str, value: Optional[str]) -> RuntimeSetting:
        setting = self.session.get(RuntimeSetting, key)
        if setting is None:
            setting = RuntimeSetting(key=key, value=value)
        else:
            setting.value = value
        self.session.add(setting)
        self.session.commit()
        self.session.refresh(setting)
        return setting

    def bulk_update(self, values: Dict[str, Optional[str]]) -> Dict[str, str]:
        for key, value in values.items():
            self.upsert(key, value)
        return self.all()
