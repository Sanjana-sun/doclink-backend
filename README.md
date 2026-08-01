# DocLink (Backend)

The REST API and encrypted data layer behind [doclink.in](https://doclink.in), a platform where doctors discuss real patient cases with true end-to-end encryption. The React frontend lives in [doclink-frontend](https://github.com/Sanjana-sun/doclink-frontend).

## Tech stack

Node.js and Express, PostgreSQL via Prisma, JWT and bcrypt auth, Agora tokens for video, deployed on Railway. The server is an encryption custodian: it stores ciphertext, nonces, and wrapped keys, and never sees plaintext patient data or any private key.

## Architecture

- **75+ REST endpoints across 17 route modules:** auth, cases, responses, doctors, CME, boards, consultations, teaching, credentials, follow, notifications, admin, leaderboard, video call, blockchain log, signals, and knowledge.
- **14-model PostgreSQL schema (Prisma):** Doctor, Case, Response, HelpfulVote, CMELog, Follow, Notification, BlockchainLog, Consultation, CaseKey, TeachingReview, Board, BoardParticipant, BehaviorLog.

### End-to-end encryption model

Patient data is encrypted client-side; the backend only ever handles wrapped keys and ciphertext. The `CaseKey` model (`caseId`, `doctorId`, `encryptedKey`, unique per pair) holds each case's symmetric key encrypted to an individual doctor's public key. Granting access to a case means storing one more wrapped key, so the server never needs, and never has, the plaintext.

## Running locally

```bash
cp .env.example .env          # set DATABASE_URL and JWT_SECRET
npm install
npx prisma migrate dev        # create tables
npm run dev                   # http://localhost:4000
```

## Status

Deployed in production at doclink.in. DocLink is a collaboration and teaching tool, not a hospital-sanctioned records system.
