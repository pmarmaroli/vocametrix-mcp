# @vocametrix/mcp-server

Official [Model Context Protocol](https://modelcontextprotocol.io) server for the [Vocametrix](https://www.vocametrix.com) voice analysis API.

Gives any MCP-compatible AI assistant (Claude Desktop, Cursor, Cline, etc.) direct access to clinical voice metrics, pronunciation assessment, speech transcription, and AI-powered therapy planning.

## Quick start

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "vocametrix": {
      "command": "npx",
      "args": ["-y", "@vocametrix/mcp-server"],
      "env": {
        "VOCAMETRIX_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

Get an API key at [vocametrix.com/registration](https://www.vocametrix.com/registration). Free trial: 5 minutes of analysis.

## Tools

### Voice quality (acoustic)
| Tool | Description |
|------|-------------|
| `vocametrix_avqi` | Acoustic Voice Quality Index (AVQI) — overall dysphonia severity |
| `vocametrix_dsi` | Dysphonia Severity Index (DSI) |
| `vocametrix_cpp_cpps` | Cepstral Peak Prominence — breathiness, hoarseness |
| `vocametrix_hnr` | Harmonics-to-Noise Ratio (multi-band) |
| `vocametrix_jitter_shimmer` | Period and amplitude perturbation |
| `vocametrix_vrp` | Voice Range Profile |
| `vocametrix_prosody_similarity` | Prosody similarity between two utterances |

### Advanced voice analysis
| Tool | Description |
|------|-------------|
| `vocametrix_spectral` | Spectral tilt, slope, and formant energy |
| `vocametrix_formants` | Formant frequencies F1–F4 |
| `vocametrix_sz_ratio` | S/Z phonation ratio |
| `vocametrix_gne` | Glottal-to-Noise Excitation |
| `vocametrix_h1h2` | H1–H2 harmonic difference |
| `vocametrix_abi` | Acoustic Breathiness Index |
| `vocametrix_voice_dynamics` | Dynamic range and fundamental frequency statistics |

### Speech and pronunciation
| Tool | Description |
|------|-------------|
| `vocametrix_assess_pronunciation` | Phoneme-level pronunciation scoring |
| `vocametrix_assess_pronunciation_pitch` | Pronunciation + pitch analysis combined |
| `vocametrix_transcribe` | Streaming ASR transcription with progress |
| `vocametrix_tts` | Text-to-speech synthesis |
| `vocametrix_tts_timing` | TTS with word-level timing data |

### Audio measures
| Tool | Description |
|------|-------------|
| `vocametrix_sound_level` | dB SPL and intensity statistics |
| `vocametrix_egemaps` | Extended Geneva Minimalistic Acoustic Parameter Set |
| `vocametrix_phoneme_detection` | Phoneme presence/absence detection |
| `vocametrix_classify_stuttering` | Dysfluency classification |

### AI agents
| Tool | Description |
|------|-------------|
| `vocametrix_agent_interpret_metrics` | Clinical interpretation of voice metrics |
| `vocametrix_agent_exercises` | Personalized voice/speech exercise generation |
| `vocametrix_agent_word_list` | Target word list generation for therapy |
| `vocametrix_agent_therapist_chat` | Conversational AI speech-language therapist |
| `vocametrix_agent_french_ipa` | French text → IPA phonetic transcription |
| `vocametrix_agent_spell` | Spelling correction agent |
| `vocametrix_agent_syntax` | Syntax checking agent |
| `vocametrix_agent_vocabulary_tutor` | Vocabulary tutoring agent |
| `vocametrix_agent_adaptive_exercise` | Adaptive exercise generation |

### Therapy planning
| Tool | Description |
|------|-------------|
| `vocametrix_generate_therapy_plan` | Generate an AI therapy plan |
| `vocametrix_get_therapy_status` | Poll therapy plan generation status |
| `vocametrix_get_therapy_result` | Fetch completed therapy plan |
| `vocametrix_approve_therapy_plan` | Approve a therapy plan |

### Workflow tools
| Tool | Description |
|------|-------------|
| `vocametrix_full_voice_assessment` | Parallel AVQI + CPP + HNR + jitter/shimmer + spectral |
| `vocametrix_batch_pronunciation` | Assess a folder of WAV files |
| `vocametrix_full_therapy_workflow` | Generate → poll → fetch → approval flow |

## Resources

- `vocametrix://docs/api` — API quick reference (auth, rate limits, audio requirements, error codes)
- `vocametrix://thresholds/{metric}` — Clinical reference thresholds for `avqi`, `dsi`, `cpp`, `hnr`, `jitter-shimmer`, `gne`

## Prompts

- `interpret_voice_assessment` — Generate a clinical SLP-style interpretation report from assessment JSON
- `compare_pre_post_therapy` — Quantified pre/post therapy narrative with metric-by-metric comparison
- `generate_session_report` — SOAP-format progress note from pronunciation assessment data

## Audio requirements

- Format: WAV (16-bit PCM recommended)
- Sustained vowel tasks: 3+ seconds of /a/ phonation
- Connected speech tasks: 5–30 seconds of read passage
- Minimum sampling rate: 16 kHz

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `VOCAMETRIX_API_KEY` | Yes | Your Vocametrix API key |

## Development

```bash
git clone https://github.com/pmarmaroli/vocametrix-mcp.git
cd vocametrix-mcp
npm install
npm run build
npm run inspector  # Test with MCP Inspector
```

## License

MIT — see [LICENSE](LICENSE)
