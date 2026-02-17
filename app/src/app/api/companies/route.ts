import { NextResponse } from "next/server";
import { createCompany, listCompanies } from "@/lib/companies-repo";

export const runtime = "nodejs";

type CreateCompanyBody = {
  name?: unknown;
};

export async function GET() {
  const companies = listCompanies();
  return NextResponse.json(companies, { status: 200 });
}

export async function POST(request: Request) {
  let body: CreateCompanyBody;

  try {
    body = (await request.json()) as CreateCompanyBody;
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_JSON",
          field: "name",
          message: "Request body must be valid JSON.",
        },
      },
      { status: 400 },
    );
  }

  if (typeof body.name !== "string") {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          field: "name",
          message: "name must be a string.",
        },
      },
      { status: 400 },
    );
  }

  const result = createCompany(body.name);

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
          code: "DUPLICATE_COMPANY",
          field: result.field,
          message: result.message,
        },
      },
      { status: 409 },
    );
  }

  return NextResponse.json(result.value, { status: 201 });
}
