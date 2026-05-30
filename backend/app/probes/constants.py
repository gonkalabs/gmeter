MODELS = [
    "moonshotai/Kimi-K2.6",
    "Qwen/Qwen3-235B-A22B-Instruct-2507-FP8",
]

MODEL_LABELS = {
    "moonshotai/Kimi-K2.6": "kimi-k2.6",
    "Qwen/Qwen3-235B-A22B-Instruct-2507-FP8": "qwen3-235b",
}

OUTPUT_SIZES = [10, 20, 50, 100, 200]
CONTEXT_SIZES = [
    ("8k", 8_000),
    ("32k", 32_000),
    ("64k", 64_000),
    ("128k", 128_000),
    ("200k", 200_000),
]

INPUT_SIZES = [
    (
        "tiny",
        "~10t",
        "What is 2+2?",
    ),
    (
        "med",
        "~300t",
        (
            "You are evaluating an AI system. The following is a detailed description of the system's "
            "architecture and capabilities: "
            + (
                "The system uses a transformer-based architecture "
                "with multiple attention heads and feed-forward layers. It has been trained on a large "
                "corpus of text data and is capable of understanding and generating natural language. "
            )
            * 8
            + "Given all that, what is the capital of France? Answer in one word."
        ),
    ),
    (
        "long",
        "~1k t",
        (
            "Background context for your analysis: "
            + (
                "The history of artificial intelligence spans "
                "several decades, beginning with the foundational work of Alan Turing in the 1950s. "
                "The field has experienced multiple cycles of enthusiasm and disillusionment, often "
                "referred to as AI winters. Key milestones include the development of expert systems "
                "in the 1980s, the rise of machine learning in the 1990s and 2000s, and the deep "
                "learning revolution of the 2010s. Recent advances in large language models have "
                "once again brought AI to the forefront of public and scientific attention. "
            )
            * 12
            + "Based on the above, what is the capital of Germany? Answer in one word."
        ),
    ),
]

MULTIMODAL_MODELS = {"moonshotai/Kimi-K2.6"}

REAL_WORLD_TESTS = {
    "tool_calling",
    "json_mode",
    "max_output",
    "max_input",
    "multimodality",
}

QUICK_TESTS = {"connectivity", "output_ladder", "tool_calling", "json_mode"}
