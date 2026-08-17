from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./gmeter.db"
    probe_interval_minutes: int = 10
    limits_interval_minutes: int = 60
    default_models: str = (
        "moonshotai/Kimi-K2.6,MiniMaxAI/MiniMax-M2.7,deepseek-ai/DeepSeek-V4-Flash-0731"
    )
    active_models: str = (
        "moonshotai/Kimi-K2.6,MiniMaxAI/MiniMax-M2.7,deepseek-ai/DeepSeek-V4-Flash-0731,"
        "zai-org/GLM-5.2-FP8"
    )
    known_models: str = (
        "moonshotai/Kimi-K2.6,MiniMaxAI/MiniMax-M2.7,deepseek-ai/DeepSeek-V4-Flash-0731,"
        "zai-org/GLM-5.2-FP8,Qwen/Qwen3-235B-A22B-Instruct-2507-FP8"
    )
    brokers_config_path: str = "brokers.json"
    brokers_config_json: str = ""
    min_output_tokens: int = 10_000
    cors_origins: str = "http://localhost:5173,http://localhost:3000"
    public_read_only: bool = True
    run_probe_on_startup: bool = True
    run_limits_on_startup: bool = False
    ai_summary_enabled: bool = True
    ai_summary_model: str = "deepseek-ai/DeepSeek-V4-Flash-0731"
    ai_summary_base_url: str = ""
    ai_summary_api_key: str = ""
    ai_summary_interval_minutes: int = 15


settings = Settings()
