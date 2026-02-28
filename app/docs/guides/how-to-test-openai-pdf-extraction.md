# How To Test OpenAI PDF Extraction Manually

This guide lets you test the OpenAI extraction API call directly, without running the full app workflow.

## 1. Prerequisites

- You have a valid `OPENAI_API_KEY`.
- You have at least one invoice PDF file to test.
- Project dependencies are installed (`npm install` already run).
- Run bash inside webcontainer `docker compose exec web bash`
- Enough platform credits and quota. see: https://platform.openai.com/settings/organization/general

## 2. Set the API key for your shell session

If your key is already in `.env.local`, load it into the current shell:

```bash
set -a; source .env.local; set +a
```

Quick check:

```bash
echo "$OPENAI_API_KEY" | wc -c
```

The output should be greater than `1`.

## 3. Run the extraction test script

Use the npm script:

```bash
npm run test:extraction -- --file /absolute/path/to/invoice.pdf --entry-type expense
```

For income invoices:

```bash
npm run test:extraction -- --file /absolute/path/to/income-invoice.pdf --entry-type income
```

Optional flags:

- `--model gpt-5-mini` (default is already `gpt-5-mini`)
- `--timeout-ms 60000`

## 4. Read the output

The script prints:

1. Extraction metadata (`responseId`, `model`, token usage when available)
2. Extracted JSON fields
3. Validation result:
   - `Validation: OK` means schema/format checks passed
   - `Validation errors:` means the model returned fields that fail app-aligned constraints

## 5. Troubleshooting

- `OPENAI_API_KEY is not set.`
  - Load `.env.local` in your current shell (step 2).
- `File is not a valid PDF signature`
  - Confirm file is a real PDF and not renamed.
- `OpenAI API request failed`
  - Check API key, model access, network, and quota.
- `Model output is not valid JSON text` or validation errors
  - The response did not conform to expected extraction format and should be treated as extraction failure.

## 6. What this script validates

- Direct OpenAI API call works with a PDF input.
- Returned fields match the extraction shape expected by the current spec:
  - `documentDate`
  - `counterpartyName`
  - `bookingText`
  - `amountGross`
  - `amountNet`
  - `amountTax`
  - `paymentReceivedDate`
