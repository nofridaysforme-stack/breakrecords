import type { ApprovalFacts } from '@breakrecords/core/checks';

// What the approval checks read for the sample label's four cards. Taken from the live seed
// (scripts/seed.ts) so sample data and live data fail the same rules. The grant's deadline was
// last checked Oct 28, as its card says.
export const mockFacts: Record<string, ApprovalFacts> = {
  "apr_payout_oct": {
    "kind": "payout",
    "periodEnd": "2026-10-31",
    "paysOn": "2026-11-10",
    "minimumCents": 2500,
    "payees": [
      {
        "name": "Marco Dela",
        "amountCents": 28500,
        "status": "included",
        "covered": true,
        "pendingAgreements": [
          "producer agreement, Glasshouse"
        ],
        "taxForm": "W-9",
        "taxExpiresOn": null,
        "withheldCents": 0,
        "treaty": false,
        "bankOnFile": true,
        "lastFailed": false,
        "split": {
          "node": "gh-rec",
          "version": 4,
          "terms": {
            "producerBp": 300,
            "labelOfNetBp": 5000,
            "artistOfNetBp": 5000,
            "featureOfArtistBp": 1000
          },
          "role": "producer"
        }
      },
      {
        "name": "Ari Monroe",
        "amountCents": 26075,
        "status": "included",
        "covered": true,
        "pendingAgreements": [],
        "taxForm": "W-9",
        "taxExpiresOn": null,
        "withheldCents": 0,
        "treaty": false,
        "bankOnFile": true,
        "lastFailed": false,
        "split": {
          "node": "gh-rec",
          "version": 4,
          "terms": {
            "producerBp": 300,
            "labelOfNetBp": 5000,
            "artistOfNetBp": 5000,
            "featureOfArtistBp": 1000
          },
          "role": "feature"
        }
      },
      {
        "name": "Theo Lind",
        "amountCents": 21420,
        "status": "included",
        "covered": false,
        "pendingAgreements": [],
        "taxForm": "W-8BEN",
        "taxExpiresOn": null,
        "withheldCents": 0,
        "treaty": false,
        "bankOnFile": true,
        "lastFailed": false,
        "split": null
      },
      {
        "name": "Rue Sato",
        "amountCents": 21420,
        "status": "included",
        "covered": false,
        "pendingAgreements": [],
        "taxForm": "W-9",
        "taxExpiresOn": "2026-12-01",
        "withheldCents": 0,
        "treaty": false,
        "bankOnFile": true,
        "lastFailed": false,
        "split": null
      },
      {
        "name": "Dana Okafor",
        "amountCents": 21420,
        "status": "included",
        "covered": false,
        "pendingAgreements": [],
        "taxForm": "W-9",
        "taxExpiresOn": null,
        "withheldCents": 0,
        "treaty": false,
        "bankOnFile": true,
        "lastFailed": false,
        "split": null
      },
      {
        "name": "Ines Pardo",
        "amountCents": 5183,
        "status": "included",
        "covered": false,
        "pendingAgreements": [],
        "taxForm": "W-9",
        "taxExpiresOn": null,
        "withheldCents": 0,
        "treaty": false,
        "bankOnFile": true,
        "lastFailed": false,
        "split": null
      },
      {
        "name": "Jules Arden",
        "amountCents": 1840,
        "status": "carried",
        "covered": false,
        "pendingAgreements": [],
        "taxForm": null,
        "taxExpiresOn": null,
        "withheldCents": 0,
        "treaty": false,
        "bankOnFile": false,
        "lastFailed": false,
        "split": null
      },
      {
        "name": "Pia Novak",
        "amountCents": 912,
        "status": "carried",
        "covered": false,
        "pendingAgreements": [],
        "taxForm": "W-9",
        "taxExpiresOn": null,
        "withheldCents": 0,
        "treaty": false,
        "bankOnFile": true,
        "lastFailed": false,
        "split": null
      }
    ],
    "income": [
      {
        "recording": "Glasshouse",
        "isrc": "USNL12600014",
        "releasedOn": "2027-03-05",
        "amountCents": 1000000
      },
      {
        "recording": "Night Bus",
        "isrc": "USNL12500031",
        "releasedOn": "2025-06-13",
        "amountCents": 233228
      },
      {
        "recording": "Velvet Hours",
        "isrc": "USNL12400007",
        "releasedOn": "2024-09-20",
        "amountCents": 45000
      },
      {
        "recording": "Paper Moons",
        "isrc": "USNL12400008",
        "releasedOn": "2024-09-20",
        "amountCents": 29260
      },
      {
        "recording": "Low Light",
        "isrc": null,
        "releasedOn": null,
        "amountCents": 15000
      }
    ],
    "flags": [
      {
        "recording": "Night Bus",
        "note": "unusual stream spike on Oct 28"
      }
    ]
  },
  "apr_producer": {
    "kind": "signature"
  },
  "apr_mlc": {
    "kind": "filing",
    "org": "MLC",
    "works": [
      {
        "title": "Glasshouse",
        "isrcs": [
          "USNL12600014"
        ],
        "writers": [
          {
            "name": "Kesi Vale",
            "shareBp": 7500,
            "pro": "ascap",
            "ipi": "00712345678",
            "signed": true
          },
          {
            "name": "Marco Dela",
            "shareBp": 2500,
            "pro": null,
            "ipi": null,
            "signed": false
          }
        ]
      },
      {
        "title": "Night Bus",
        "isrcs": [
          "USNL12500029",
          "USNL12500031"
        ],
        "writers": [
          {
            "name": "Dana Okafor",
            "shareBp": 3400,
            "pro": "bmi",
            "ipi": "00623451987",
            "signed": true
          },
          {
            "name": "Rue Sato",
            "shareBp": 3300,
            "pro": "ascap",
            "ipi": null,
            "signed": true
          },
          {
            "name": "Theo Lind",
            "shareBp": 3300,
            "pro": "bmi",
            "ipi": "00598712340",
            "signed": true
          }
        ]
      },
      {
        "title": "Static Hymn",
        "isrcs": [
          "USNL12500032"
        ],
        "writers": [
          {
            "name": "Dana Okafor",
            "shareBp": 3400,
            "pro": "bmi",
            "ipi": "00623451987",
            "signed": false
          },
          {
            "name": "Rue Sato",
            "shareBp": 3300,
            "pro": "ascap",
            "ipi": null,
            "signed": false
          },
          {
            "name": "Theo Lind",
            "shareBp": 3300,
            "pro": "bmi",
            "ipi": "00598712340",
            "signed": false
          }
        ]
      }
    ]
  },
  "apr_grant": {
    "kind": "grant",
    "deadline": "2026-11-15",
    "verifiedOn": "2026-10-28",
    "fields": [
      {
        "label": "Project summary",
        "limit": 1500,
        "value": "Northline Records is an independent label releasing \"Glasshouse,\" a new single by R&B artist Kesi Vale, on March 5, 2027. The grant would pay for mastering, a live session video made with local crew, and a free all-ages release show."
      },
      {
        "label": "Community benefit",
        "limit": 800,
        "value": "The release show is free and all-ages, and the session video hires local camera and sound crew."
      }
    ]
  }
};
