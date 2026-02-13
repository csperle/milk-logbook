import { NextResponse } from "next/server";
import { createExpenseType, listExpenseTypes } from "@/lib/expense-types-repo";

export const runtime = "nodejs";

export async function GET() {
  const expenseTypes = listExpenseTypes();
  return NextResponse.json(expenseTypes, { status: 200 });
}

type CreateExpenseTypeBody = {
  expenseTypeText?: unknown;
};

export async function POST(request: Request) {
  let body: CreateExpenseTypeBody;

  try {
    body = (await request.json()) as CreateExpenseTypeBody;
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_JSON",
          field: "expenseTypeText",
          message: "Request body must be valid JSON.",
        },
      },
      { status: 400 },
    );
  }

  if (typeof body.expenseTypeText !== "string") {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          field: "expenseTypeText",
          message: "expenseTypeText must be a string.",
        },
      },
      { status: 400 },
    );
  }

  const result = createExpenseType(body.expenseTypeText);

  if (!result.ok && result.reason === "validation") {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          field: result.field,
          message: result.message,
        },
      },
      { status: 400 },
    );
  }

  if (!result.ok && result.reason === "duplicate") {
    return NextResponse.json(
      {
        error: {
          code: "DUPLICATE_EXPENSE_TYPE",
          field: result.field,
          message: result.message,
        },
      },
      { status: 409 },
    );
  }

  return NextResponse.json(result.value, { status: 201 });
}
