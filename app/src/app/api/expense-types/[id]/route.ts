import { NextResponse } from "next/server";
import { deleteExpenseTypeById } from "@/lib/expense-types-repo";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ id: string }>;
};

export async function DELETE(_: Request, { params }: Params) {
  const { id } = await params;
  const parsedId = Number(id);

  if (!Number.isInteger(parsedId) || parsedId < 1) {
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
