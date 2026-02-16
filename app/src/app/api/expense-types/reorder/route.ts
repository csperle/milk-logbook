import { NextResponse } from "next/server";
import { reorderExpenseTypes } from "@/lib/expense-types-repo";

export const runtime = "nodejs";

type ReorderExpenseTypesBody = {
  orderedExpenseTypeIds?: unknown;
};

export async function PATCH(request: Request) {
  let body: ReorderExpenseTypesBody;

  try {
    body = (await request.json()) as ReorderExpenseTypesBody;
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_JSON",
          field: "orderedExpenseTypeIds",
          message: "Request body must be valid JSON.",
        },
      },
      { status: 400 },
    );
  }

  if (!Array.isArray(body.orderedExpenseTypeIds)) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          field: "orderedExpenseTypeIds",
          message: "orderedExpenseTypeIds must be an array of positive integers.",
        },
      },
      { status: 400 },
    );
  }

  const orderedExpenseTypeIds = body.orderedExpenseTypeIds;
  const hasInvalidId = orderedExpenseTypeIds.some(
    (id) => !Number.isInteger(id) || id < 1,
  );

  if (hasInvalidId) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          field: "orderedExpenseTypeIds",
          message: "orderedExpenseTypeIds must be an array of positive integers.",
        },
      },
      { status: 400 },
    );
  }

  const result = reorderExpenseTypes(orderedExpenseTypeIds as number[]);

  if (!result.ok) {
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

  return new NextResponse(null, { status: 204 });
}
