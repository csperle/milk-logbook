import { NextResponse } from "next/server";
import { deleteExpenseTypeById, updateExpenseTypeById } from "@/lib/expense-types-repo";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ id: string }>;
};

type UpdateExpenseTypeBody = {
  expenseTypeText?: unknown;
  plCategory?: unknown;
};

function parseId(id: string): number | null {
  const parsedId = Number(id);
  if (!Number.isInteger(parsedId) || parsedId < 1) {
    return null;
  }
  return parsedId;
}

export async function PUT(request: Request, { params }: Params) {
  const { id } = await params;
  const parsedId = parseId(id);

  if (parsedId === null) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          field: "id",
          message: "id must be a positive integer.",
        },
      },
      { status: 400 },
    );
  }

  let body: UpdateExpenseTypeBody;
  try {
    body = (await request.json()) as UpdateExpenseTypeBody;
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

  if ("expenseTypeText" in body && typeof body.expenseTypeText !== "string") {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          field: "expenseTypeText",
          message: "expenseTypeText must be a string when provided.",
        },
      },
      { status: 400 },
    );
  }

  const result = updateExpenseTypeById({
    id: parsedId,
    expenseTypeText: body.expenseTypeText as string | undefined,
    plCategory: typeof body.plCategory === "string" ? body.plCategory : null,
  });

  if (!result.ok && result.reason === "pl_category_required") {
    return NextResponse.json(
      {
        error: {
          code: "PL_CATEGORY_REQUIRED",
          field: result.field,
          message: result.message,
        },
      },
      { status: 400 },
    );
  }

  if (!result.ok && result.reason === "invalid_pl_category") {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_PL_CATEGORY",
          field: result.field,
          message: result.message,
        },
      },
      { status: 400 },
    );
  }

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

  if (!result.ok && result.reason === "not_found") {
    return NextResponse.json(
      {
        error: {
          code: "NOT_FOUND",
          field: "id",
          message: result.message,
        },
      },
      { status: 404 },
    );
  }

  return NextResponse.json(result.value, { status: 200 });
}

export async function DELETE(_: Request, { params }: Params) {
  const { id } = await params;
  const parsedId = parseId(id);

  if (parsedId === null) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          field: "id",
          message: "id must be a positive integer.",
        },
      },
      { status: 400 },
    );
  }

  const result = deleteExpenseTypeById(parsedId);

  if (!result.ok && result.reason === "not_found") {
    return NextResponse.json(
      {
        error: {
          code: "NOT_FOUND",
          field: "id",
          message: result.message,
        },
      },
      { status: 404 },
    );
  }

  if (!result.ok && result.reason === "conflict") {
    return NextResponse.json(
      {
        error: {
          code: "EXPENSE_TYPE_IN_USE",
          field: "id",
          message: result.message,
        },
      },
      { status: 409 },
    );
  }

  return new NextResponse(null, { status: 204 });
}
