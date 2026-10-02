-- Required by the GIN trigram indexes below (docs/03-data-model.md §1)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateEnum
CREATE TYPE "QuotationType" AS ENUM ('LAB', 'DESIGN', 'CONSTRUCTION', 'CONSULTING', 'OTHER');

-- CreateEnum
CREATE TYPE "QuotationStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "BillingStatus" AS ENUM ('DRAFT', 'REQUESTED', 'INVOICED', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TimesheetStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CalendarPreference" AS ENUM ('BUDDHIST', 'GREGORIAN');

-- CreateEnum
CREATE TYPE "LicenseType" AS ENUM ('ENGINEER', 'ARCHITECT', 'OTHER');

-- CreateEnum
CREATE TYPE "LicenseBranch" AS ENUM ('CIVIL', 'MECHANICAL', 'ELECTRICAL_POWER', 'ELECTRICAL_COMMUNICATION', 'INDUSTRIAL', 'ENVIRONMENTAL', 'CHEMICAL', 'MINING', 'OTHER');

-- CreateEnum
CREATE TYPE "LicenseLevel" AS ENUM ('ASSOCIATE', 'ASSOCIATE_SPECIAL', 'PROFESSIONAL', 'SENIOR');

-- CreateEnum
CREATE TYPE "ClientPlatform" AS ENUM ('WEB', 'ANDROID', 'IOS');

-- CreateEnum
CREATE TYPE "FileStatus" AS ENUM ('PENDING_UPLOAD', 'PROCESSING', 'AVAILABLE', 'REJECTED', 'DELETED');

-- CreateEnum
CREATE TYPE "AttachmentOwnerType" AS ENUM ('PROJECT', 'CLIENT', 'SITE', 'TRANSMITTAL', 'DESIGN_BASIS', 'COMMENT', 'DAILY_REPORT', 'ISSUE', 'INSPECTION', 'INSPECTION_RESULT', 'SITE_QUERY', 'LAB_JOB', 'SAMPLE', 'SAMPLING_STOP', 'INSTRUMENT_EVENT', 'QUOTATION');

-- CreateEnum
CREATE TYPE "CommentOwnerType" AS ENUM ('DOCUMENT_REVISION', 'TRANSMITTAL', 'DESIGN_BASIS', 'TASK', 'DAILY_REPORT', 'ISSUE', 'SITE_QUERY', 'LAB_JOB', 'SAMPLE', 'QUOTATION');

-- CreateEnum
CREATE TYPE "CommentStatus" AS ENUM ('NONE', 'OPEN', 'RESPONDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL', 'PUSH', 'LINE');

-- CreateEnum
CREATE TYPE "ChangeOp" AS ENUM ('UPSERT', 'DELETE');

-- CreateEnum
CREATE TYPE "NumberedEntity" AS ENUM ('PROJECT', 'DOCUMENT', 'TRANSMITTAL', 'ISSUE', 'INSPECTION', 'SITE_QUERY', 'LAB_JOB', 'SAMPLE', 'ANALYSIS_BATCH', 'TEST_REPORT', 'SAMPLING_TRIP', 'QUOTATION', 'BILLING');

-- CreateEnum
CREATE TYPE "SequenceReset" AS ENUM ('NEVER', 'YEARLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "SignatureMethod" AS ENUM ('PASSWORD', 'SIGNING_PIN', 'SSO_REAUTH');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('USER', 'SYSTEM', 'PUBLIC_LINK');

-- CreateEnum
CREATE TYPE "ClientType" AS ENUM ('COMPANY', 'GOVERNMENT', 'STATE_ENTERPRISE', 'LOCAL_AUTHORITY', 'INDIVIDUAL', 'OTHER');

-- CreateEnum
CREATE TYPE "SiteType" AS ENUM ('FACTORY', 'BUILDING', 'INDUSTRIAL_ESTATE', 'MUNICIPAL', 'WATER_TREATMENT_PLANT', 'WASTEWATER_TREATMENT_PLANT', 'NATURAL_WATER_BODY', 'OTHER');

-- CreateEnum
CREATE TYPE "BuildingClass" AS ENUM ('A', 'B', 'C', 'D', 'E');

-- CreateEnum
CREATE TYPE "SamplingPointType" AS ENUM ('RAW_WATER', 'INFLUENT', 'EFFLUENT', 'TREATED_WATER', 'TAP_WATER', 'SURFACE_WATER', 'GROUNDWATER', 'PROCESS', 'SLUDGE', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentSource" AS ENUM ('INTERNAL', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('ACTIVE', 'ON_HOLD', 'CANCELLED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "Confidentiality" AS ENUM ('INTERNAL', 'CLIENT_SHAREABLE', 'CONFIDENTIAL');

-- CreateEnum
CREATE TYPE "PurposeCode" AS ENUM ('FI', 'FR', 'FA', 'FT', 'FC', 'AB');

-- CreateEnum
CREATE TYPE "RevisionStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'ISSUED', 'SUPERSEDED', 'VOID');

-- CreateEnum
CREATE TYPE "DocumentFileRole" AS ENUM ('PDF_RENDITION', 'NATIVE', 'SUPPORTING');

-- CreateEnum
CREATE TYPE "ReviewCycleStatus" AS ENUM ('IN_PROGRESS', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReviewStepKind" AS ENUM ('CHECK', 'REVIEW', 'APPROVE');

-- CreateEnum
CREATE TYPE "ReviewStepStatus" AS ENUM ('PENDING', 'ACTIVE', 'APPROVED', 'APPROVED_WITH_COMMENTS', 'REJECTED', 'SKIPPED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TransmittalStatus" AS ENUM ('DRAFT', 'SENT', 'ACKNOWLEDGED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DeliveryMethod" AS ENUM ('EMAIL_ATTACHMENT', 'EMAIL_LINK', 'HARD_COPY', 'OTHER');

-- CreateEnum
CREATE TYPE "TransmittalFormat" AS ENUM ('PDF', 'NATIVE', 'PDF_AND_NATIVE', 'HARD_COPY');

-- CreateEnum
CREATE TYPE "ClientReturnCode" AS ENUM ('CODE_1', 'CODE_2', 'CODE_3', 'CODE_4', 'INFO');

-- CreateEnum
CREATE TYPE "DesignBasisStatus" AS ENUM ('DRAFT', 'APPROVED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "DesignValueSource" AS ENUM ('ASSUMED', 'MEASURED', 'CLIENT_PROVIDED', 'STANDARD', 'CALCULATED');

-- CreateEnum
CREATE TYPE "ParameterCategory" AS ENUM ('PHYSICAL', 'INORGANIC', 'ORGANIC', 'NUTRIENT', 'METAL', 'MICROBIOLOGICAL', 'OTHER');

-- CreateEnum
CREATE TYPE "Matrix" AS ENUM ('DRINKING_WATER', 'SURFACE_WATER', 'GROUNDWATER', 'WASTEWATER', 'TREATED_WASTEWATER', 'SEAWATER', 'SLUDGE', 'OTHER');

-- CreateEnum
CREATE TYPE "RoundingMode" AS ENUM ('HALF_UP', 'HALF_EVEN');

-- CreateEnum
CREATE TYPE "StandardCategory" AS ENUM ('INDUSTRIAL_EFFLUENT', 'BUILDING_EFFLUENT', 'INDUSTRIAL_ESTATE', 'DRINKING_WATER', 'SURFACE_WATER', 'GROUNDWATER', 'CUSTOM');

-- CreateEnum
CREATE TYPE "LimitComparator" AS ENUM ('MAX', 'MIN', 'RANGE', 'NOT_DETECTED', 'MAX_INCREASE_OVER_BASELINE', 'INFO');

-- CreateEnum
CREATE TYPE "LimitEvaluation" AS ENUM ('AUTO', 'MANUAL');

-- CreateEnum
CREATE TYPE "ComplianceStatus" AS ENUM ('PASS', 'FAIL', 'NOT_EVALUATED');

-- CreateEnum
CREATE TYPE "LabJobStatus" AS ENUM ('DRAFT', 'OPEN', 'IN_PROGRESS', 'COMPLETED', 'REPORTED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LabPriority" AS ENUM ('NORMAL', 'URGENT');

-- CreateEnum
CREATE TYPE "SampleStatus" AS ENUM ('REGISTERED', 'RECEIVED', 'IN_ANALYSIS', 'ANALYSIS_COMPLETE', 'REPORTED', 'REJECTED', 'CANCELLED', 'DISPOSED');

-- CreateEnum
CREATE TYPE "ReceiptCondition" AS ENUM ('ACCEPTABLE', 'ACCEPTED_WITH_DEVIATION', 'REJECTED');

-- CreateEnum
CREATE TYPE "SampleTestStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'RESULT_ENTERED', 'REVIEWED', 'APPROVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ResultQualifier" AS ENUM ('NONE', 'LESS_THAN', 'GREATER_THAN', 'NOT_DETECTED');

-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('OPEN', 'COMPLETED', 'QC_FAILED', 'APPROVED');

-- CreateEnum
CREATE TYPE "QcType" AS ENUM ('METHOD_BLANK', 'LCS', 'LCS_DUPLICATE', 'SAMPLE_DUPLICATE', 'MATRIX_SPIKE', 'MATRIX_SPIKE_DUPLICATE', 'CALIBRATION_CHECK');

-- CreateEnum
CREATE TYPE "InstrumentStatus" AS ENUM ('IN_SERVICE', 'OUT_OF_SERVICE', 'RETIRED');

-- CreateEnum
CREATE TYPE "InstrumentEventType" AS ENUM ('CALIBRATION', 'VERIFICATION', 'MAINTENANCE', 'REPAIR');

-- CreateEnum
CREATE TYPE "EventResult" AS ENUM ('PASS', 'FAIL');

-- CreateEnum
CREATE TYPE "TestReportStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'ISSUED', 'SUPERSEDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProjectType" AS ENUM ('DESIGN', 'DESIGN_BUILD', 'CONSTRUCTION', 'OPERATION_MAINTENANCE', 'MONITORING', 'CONSULTING', 'OTHER');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProjectRole" AS ENUM ('PROJECT_MANAGER', 'DESIGN_MANAGER', 'ENGINEER', 'DRAFTER', 'DOCUMENT_CONTROLLER', 'SITE_ENGINEER', 'FOREMAN', 'VIEWER');

-- CreateEnum
CREATE TYPE "RevisionScheme" AS ENUM ('ALPHA_NUMERIC', 'ISO19650');

-- CreateEnum
CREATE TYPE "TaskType" AS ENUM ('PHASE', 'TASK', 'MILESTONE');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DependencyType" AS ENUM ('FS', 'SS', 'FF', 'SF');

-- CreateEnum
CREATE TYPE "PaymentMilestoneStatus" AS ENUM ('PENDING', 'SUBMITTED', 'ACCEPTED', 'INVOICED', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SamplingTripStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SamplingStopStatus" AS ENUM ('PENDING', 'SAMPLED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "DailyReportStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'RETURNED');

-- CreateEnum
CREATE TYPE "Weather" AS ENUM ('SUNNY', 'CLOUDY', 'RAIN', 'HEAVY_RAIN', 'STORM');

-- CreateEnum
CREATE TYPE "IssueCategory" AS ENUM ('DEFECT', 'SAFETY', 'QUALITY', 'DESIGN', 'ENVIRONMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "IssueSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "IssueStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'VERIFIED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InspectionStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "InspectionOutcome" AS ENUM ('PASS', 'FAIL', 'CONDITIONAL');

-- CreateEnum
CREATE TYPE "ChecklistResponseType" AS ENUM ('PASS_FAIL_NA', 'NUMBER', 'TEXT', 'PHOTO');

-- CreateEnum
CREATE TYPE "PassFail" AS ENUM ('PASS', 'FAIL', 'NA');

-- CreateEnum
CREATE TYPE "SiteQueryStatus" AS ENUM ('OPEN', 'ANSWERED', 'CLOSED', 'CANCELLED');

-- CreateTable
CREATE TABLE "quotations" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "rev_no" INTEGER NOT NULL DEFAULT 0,
    "client_id" UUID NOT NULL,
    "contact_id" UUID,
    "project_id" UUID,
    "type" "QuotationType" NOT NULL,
    "status" "QuotationStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "issue_date" DATE,
    "valid_until" DATE,
    "currency" TEXT NOT NULL DEFAULT 'THB',
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discount_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "vat_rate" DECIMAL(5,2) NOT NULL,
    "vat_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "withholding_rate" DECIMAL(5,2),
    "total_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "terms" TEXT,
    "notes" TEXT,
    "prepared_by_id" UUID NOT NULL,
    "approved_by_id" UUID,
    "approved_at" TIMESTAMPTZ(3),
    "sent_at" TIMESTAMPTZ(3),
    "accepted_at" TIMESTAMPTZ(3),
    "rejected_reason" TEXT,
    "pdf_file_id" UUID,
    "supersedes_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "quotations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotation_items" (
    "id" UUID NOT NULL,
    "quotation_id" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "method_id" UUID,
    "package_id" UUID,
    "quantity" DECIMAL(14,4) NOT NULL,
    "unit" TEXT,
    "unit_price" DECIMAL(14,2) NOT NULL,
    "discount_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "amount" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "quotation_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_records" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "external_ref" TEXT,
    "client_id" UUID NOT NULL,
    "project_id" UUID,
    "lab_job_id" UUID,
    "payment_milestone_id" UUID,
    "quotation_id" UUID,
    "status" "BillingStatus" NOT NULL DEFAULT 'DRAFT',
    "description" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "vat_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "withholding_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(14,2) NOT NULL,
    "requested_at" TIMESTAMPTZ(3),
    "invoiced_at" DATE,
    "due_date" DATE,
    "paid_at" DATE,
    "notes" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "billing_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timesheets" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "week_start" DATE NOT NULL,
    "status" "TimesheetStatus" NOT NULL DEFAULT 'DRAFT',
    "submitted_at" TIMESTAMPTZ(3),
    "approved_by_id" UUID,
    "approved_at" TIMESTAMPTZ(3),
    "reject_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "timesheets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timesheet_entries" (
    "id" UUID NOT NULL,
    "timesheet_id" UUID NOT NULL,
    "work_date" DATE NOT NULL,
    "project_id" UUID,
    "task_id" UUID,
    "category" TEXT,
    "hours" DECIMAL(4,2) NOT NULL,
    "description" TEXT,
    "is_billable" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "timesheet_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_rates" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "project_role" "ProjectRole",
    "rate_per_hour" DECIMAL(10,2) NOT NULL,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cost_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name_th" TEXT NOT NULL,
    "name_en" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT,
    "employee_code" TEXT,
    "display_name_th" TEXT NOT NULL,
    "display_name_en" TEXT,
    "position" TEXT,
    "phone" TEXT,
    "department_id" UUID,
    "locale" TEXT NOT NULL DEFAULT 'th',
    "calendar" "CalendarPreference" NOT NULL DEFAULT 'BUDDHIST',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "must_change_password" BOOLEAN NOT NULL DEFAULT false,
    "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
    "mfa_secret_enc" TEXT,
    "signing_pin_hash" TEXT,
    "signature_image_file_id" UUID,
    "avatar_file_id" UUID,
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(3),
    "last_login_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name_th" TEXT NOT NULL,
    "name_en" TEXT,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" UUID NOT NULL,
    "permission" TEXT NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "granted_by_id" UUID,
    "granted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role_id")
);

-- CreateTable
CREATE TABLE "professional_licenses" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "LicenseType" NOT NULL,
    "branch" "LicenseBranch",
    "level" "LicenseLevel",
    "license_no" TEXT NOT NULL,
    "issued_at" DATE,
    "expires_at" DATE NOT NULL,
    "file_id" UUID,
    "verified_by_id" UUID,
    "verified_at" TIMESTAMPTZ(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "professional_licenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "refresh_token_hash" TEXT NOT NULL,
    "platform" "ClientPlatform" NOT NULL,
    "device_id" TEXT,
    "device_name" TEXT,
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "revoked_reason" TEXT,
    "replaced_by_session_id" UUID,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_devices" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "platform" "ClientPlatform" NOT NULL,
    "fcm_token" TEXT NOT NULL,
    "app_version" TEXT,
    "device_model" TEXT,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disabled_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_by_id" UUID,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "numbering_schemes" (
    "id" UUID NOT NULL,
    "entity" "NumberedEntity" NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'GLOBAL',
    "pattern" TEXT NOT NULL,
    "reset_policy" "SequenceReset" NOT NULL DEFAULT 'YEARLY',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "numbering_schemes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "number_sequences" (
    "key" TEXT NOT NULL,
    "current_value" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "number_sequences_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "idempotency_records" (
    "user_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "response_status" INTEGER NOT NULL,
    "response_body" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("user_id","key")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_type" "ActorType" NOT NULL DEFAULT 'USER',
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "project_id" UUID,
    "summary" TEXT,
    "changes" JSONB,
    "reason" TEXT,
    "ip" TEXT,
    "user_agent" TEXT,
    "request_id" TEXT,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "aggregate_id" UUID,
    "available_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "processed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "change_logs" (
    "seq" BIGSERIAL NOT NULL,
    "scope_key" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "op" "ChangeOp" NOT NULL,
    "changed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "change_logs_pkey" PRIMARY KEY ("seq")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "entity_type" TEXT,
    "entity_id" UUID,
    "project_id" UUID,
    "read_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "user_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "channels" "NotificationChannel"[],

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("user_id","type")
);

-- CreateTable
CREATE TABLE "file_objects" (
    "id" UUID NOT NULL,
    "bucket" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "sha256" TEXT,
    "status" "FileStatus" NOT NULL DEFAULT 'PENDING_UPLOAD',
    "page_count" INTEGER,
    "preview_key" TEXT,
    "metadata" JSONB,
    "uploaded_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(3),
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "file_objects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" UUID NOT NULL,
    "owner_type" "AttachmentOwnerType" NOT NULL,
    "owner_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "caption" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "taken_at" TIMESTAMPTZ(3),
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comments" (
    "id" UUID NOT NULL,
    "owner_type" "CommentOwnerType" NOT NULL,
    "owner_id" UUID NOT NULL,
    "parent_id" UUID,
    "author_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "mentions" UUID[],
    "anchor" JSONB,
    "status" "CommentStatus" NOT NULL DEFAULT 'NONE',
    "review_step_id" UUID,
    "carried_from_comment_id" UUID,
    "response_note" TEXT,
    "resolved_by_id" UUID,
    "resolved_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signature_events" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "purpose" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "method" "SignatureMethod" NOT NULL,
    "file_sha256" TEXT,
    "payload_sha256" TEXT NOT NULL,
    "license_id" UUID,
    "ip" TEXT,
    "user_agent" TEXT,
    "signed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "signature_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name_th" TEXT NOT NULL,
    "name_en" TEXT,
    "client_type" "ClientType" NOT NULL DEFAULT 'COMPANY',
    "tax_id" TEXT,
    "branch_code" TEXT,
    "industry" TEXT,
    "address_line" TEXT,
    "subdistrict" TEXT,
    "district" TEXT,
    "province" TEXT,
    "postcode" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_contacts" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "position" TEXT,
    "department" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "receives_transmittals" BOOLEAN NOT NULL DEFAULT false,
    "receives_lab_reports" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "client_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sites" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "site_type" "SiteType" NOT NULL,
    "address_line" TEXT,
    "subdistrict" TEXT,
    "district" TEXT,
    "province" TEXT,
    "postcode" TEXT,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "building_class" "BuildingClass",
    "factory_registration_no" TEXT,
    "factory_type_code" TEXT,
    "default_standard_id" UUID,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "sites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sampling_points" (
    "id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "point_type" "SamplingPointType" NOT NULL,
    "description" TEXT,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "default_standard_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "sampling_points_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disciplines" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name_th" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "disciplines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_types" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name_th" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "requires_pdf_rendition" BOOLEAN NOT NULL DEFAULT true,
    "requires_licensed_approver" BOOLEAN NOT NULL DEFAULT false,
    "allowed_license_branches" "LicenseBranch"[],
    "min_license_level" "LicenseLevel",
    "default_workflow_template_id" UUID,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "document_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_templates" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "workflow_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_template_steps" (
    "id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "step_order" INTEGER NOT NULL,
    "kind" "ReviewStepKind" NOT NULL,
    "name" TEXT NOT NULL,
    "allowed_project_roles" "ProjectRole"[],
    "requires_signature" BOOLEAN NOT NULL DEFAULT false,
    "requires_license" BOOLEAN NOT NULL DEFAULT false,
    "due_days" INTEGER NOT NULL DEFAULT 3,
    "is_optional" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "workflow_template_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "title_en" TEXT,
    "discipline_id" UUID NOT NULL,
    "document_type_id" UUID NOT NULL,
    "source" "DocumentSource" NOT NULL DEFAULT 'INTERNAL',
    "originator" TEXT,
    "external_number" TEXT,
    "status" "DocumentStatus" NOT NULL DEFAULT 'ACTIVE',
    "confidentiality" "Confidentiality" NOT NULL DEFAULT 'CLIENT_SHAREABLE',
    "sheet_size" TEXT,
    "scale" TEXT,
    "owner_id" UUID,
    "workflow_template_id" UUID,
    "current_revision_id" UUID,
    "latest_approved_revision_id" UUID,
    "superseded_by_document_id" UUID,
    "tags" TEXT[],
    "remarks" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_plans" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "purpose_code" "PurposeCode" NOT NULL,
    "planned_date" DATE,
    "forecast_date" DATE,
    "actual_date" DATE,

    CONSTRAINT "document_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_revisions" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "rev_label" TEXT NOT NULL,
    "rev_index" INTEGER NOT NULL,
    "purpose_code" "PurposeCode" NOT NULL,
    "status" "RevisionStatus" NOT NULL DEFAULT 'DRAFT',
    "description" TEXT,
    "prepared_by_id" UUID NOT NULL,
    "checked_by_id" UUID,
    "approved_by_id" UUID,
    "approved_at" TIMESTAMPTZ(3),
    "issued_at" TIMESTAMPTZ(3),
    "locked_at" TIMESTAMPTZ(3),
    "last_cycle_outcome" "ReviewCycleStatus",
    "client_return_code" "ClientReturnCode",
    "client_returned_at" DATE,
    "voided_at" TIMESTAMPTZ(3),
    "voided_by_id" UUID,
    "void_reason" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "document_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_files" (
    "id" UUID NOT NULL,
    "revision_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "role" "DocumentFileRole" NOT NULL,
    "upload_version" INTEGER NOT NULL DEFAULT 1,
    "is_current" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "uploaded_by_id" UUID NOT NULL,
    "uploaded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_cycles" (
    "id" UUID NOT NULL,
    "revision_id" UUID NOT NULL,
    "cycle_no" INTEGER NOT NULL,
    "template_id" UUID,
    "status" "ReviewCycleStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "reviewed_file_id" UUID,
    "reviewed_file_sha256" TEXT,
    "submitted_by_id" UUID NOT NULL,
    "submitted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submit_note" TEXT,
    "completed_at" TIMESTAMPTZ(3),
    "cancelled_reason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "review_cycles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_steps" (
    "id" UUID NOT NULL,
    "cycle_id" UUID NOT NULL,
    "step_order" INTEGER NOT NULL,
    "kind" "ReviewStepKind" NOT NULL,
    "name" TEXT NOT NULL,
    "assignee_id" UUID NOT NULL,
    "status" "ReviewStepStatus" NOT NULL DEFAULT 'PENDING',
    "requires_signature" BOOLEAN NOT NULL DEFAULT false,
    "requires_license" BOOLEAN NOT NULL DEFAULT false,
    "is_optional" BOOLEAN NOT NULL DEFAULT false,
    "activated_at" TIMESTAMPTZ(3),
    "due_at" TIMESTAMPTZ(3),
    "decided_at" TIMESTAMPTZ(3),
    "decision_note" TEXT,
    "delegated_from_user_id" UUID,
    "signature_event_id" UUID,
    "last_reminded_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "review_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transmittals" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "recipient_client_id" UUID,
    "recipient_name" TEXT NOT NULL,
    "recipient_emails" TEXT[],
    "cc_emails" TEXT[],
    "purpose_code" "PurposeCode" NOT NULL,
    "message" TEXT,
    "status" "TransmittalStatus" NOT NULL DEFAULT 'DRAFT',
    "delivery_method" "DeliveryMethod" NOT NULL,
    "cover_sheet_file_id" UUID,
    "package_file_id" UUID,
    "public_token_hash" TEXT,
    "link_expires_at" TIMESTAMPTZ(3),
    "link_revoked_at" TIMESTAMPTZ(3),
    "sent_at" TIMESTAMPTZ(3),
    "sent_by_id" UUID,
    "acknowledged_at" TIMESTAMPTZ(3),
    "acknowledged_note" TEXT,
    "acknowledged_by_id" UUID,
    "acknowledgement_file_id" UUID,
    "cancelled_at" TIMESTAMPTZ(3),
    "cancel_reason" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "transmittals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transmittal_items" (
    "id" UUID NOT NULL,
    "transmittal_id" UUID NOT NULL,
    "revision_id" UUID NOT NULL,
    "copies" INTEGER NOT NULL DEFAULT 1,
    "format" "TransmittalFormat" NOT NULL DEFAULT 'PDF',
    "remark" TEXT,
    "client_return_code" "ClientReturnCode",
    "client_returned_at" DATE,
    "client_response_note" TEXT,
    "client_comment_file_id" UUID,
    "recorded_by_id" UUID,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "transmittal_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transmittal_downloads" (
    "id" UUID NOT NULL,
    "transmittal_id" UUID NOT NULL,
    "file_id" UUID,
    "ip" TEXT,
    "user_agent" TEXT,
    "downloaded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transmittal_downloads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "design_bases" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "rev_no" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "status" "DesignBasisStatus" NOT NULL DEFAULT 'DRAFT',
    "average_flow_m3_per_day" DECIMAL(12,2),
    "peak_factor" DECIMAL(6,3),
    "design_horizon_year" INTEGER,
    "population_equivalent" INTEGER,
    "target_standard_id" UUID,
    "notes" TEXT,
    "approved_by_id" UUID,
    "approved_at" TIMESTAMPTZ(3),
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "design_bases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "design_basis_items" (
    "id" UUID NOT NULL,
    "design_basis_id" UUID NOT NULL,
    "parameter_id" UUID,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "influent_value" DECIMAL(24,10),
    "influent_min" DECIMAL(24,10),
    "influent_max" DECIMAL(24,10),
    "target_effluent_value" DECIMAL(24,10),
    "source" "DesignValueSource" NOT NULL DEFAULT 'ASSUMED',
    "source_note" TEXT,
    "sample_test_ids" UUID[],
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "design_basis_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parameters" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name_th" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "cas_no" TEXT,
    "category" "ParameterCategory" NOT NULL,
    "default_unit" TEXT NOT NULL,
    "decimals" INTEGER NOT NULL DEFAULT 2,
    "is_field_parameter" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "parameters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calc_formulas" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "expression" TEXT NOT NULL,
    "inputs" JSONB NOT NULL,
    "validations" JSONB,
    "output_unit" TEXT,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calc_formulas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytical_methods" (
    "id" UUID NOT NULL,
    "parameter_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "reference" TEXT,
    "matrices" "Matrix"[],
    "unit" TEXT NOT NULL,
    "lod" DECIMAL(24,10),
    "loq" DECIMAL(24,10),
    "range_min" DECIMAL(24,10),
    "range_max" DECIMAL(24,10),
    "decimals" INTEGER,
    "significant_figures" INTEGER,
    "rounding_mode" "RoundingMode" NOT NULL DEFAULT 'HALF_UP',
    "holding_time_hours" INTEGER,
    "preservation" TEXT,
    "container_type" TEXT,
    "container_volume_ml" INTEGER,
    "is_accredited" BOOLEAN NOT NULL DEFAULT false,
    "tat_days" INTEGER NOT NULL DEFAULT 7,
    "price" DECIMAL(12,2),
    "calc_formula_id" UUID,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "analytical_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qc_criteria" (
    "id" UUID NOT NULL,
    "method_id" UUID NOT NULL,
    "qc_type" "QcType" NOT NULL,
    "every_n" INTEGER,
    "min_recovery" DECIMAL(6,2),
    "max_recovery" DECIMAL(6,2),
    "max_rpd" DECIMAL(6,2),
    "max_blank" DECIMAL(24,10),
    "notes" TEXT,

    CONSTRAINT "qc_criteria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_packages" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(12,2),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "test_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_package_items" (
    "package_id" UUID NOT NULL,
    "method_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "test_package_items_pkey" PRIMARY KEY ("package_id","method_id")
);

-- CreateTable
CREATE TABLE "regulatory_standards" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name_th" TEXT NOT NULL,
    "name_en" TEXT,
    "category" "StandardCategory" NOT NULL,
    "subtype" TEXT,
    "source_ref" TEXT,
    "gazette_ref" TEXT,
    "effective_date" DATE,
    "is_custom" BOOLEAN NOT NULL DEFAULT false,
    "base_standard_id" UUID,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "regulatory_standards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "standard_limits" (
    "id" UUID NOT NULL,
    "standard_id" UUID NOT NULL,
    "parameter_id" UUID NOT NULL,
    "comparator" "LimitComparator" NOT NULL,
    "min_value" DECIMAL(24,10),
    "max_value" DECIMAL(24,10),
    "unit" TEXT NOT NULL,
    "evaluation" "LimitEvaluation" NOT NULL DEFAULT 'AUTO',
    "note" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "standard_limits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lab_jobs" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "client_id" UUID NOT NULL,
    "site_id" UUID,
    "project_id" UUID,
    "contact_id" UUID,
    "quotation_id" UUID,
    "standard_id" UUID,
    "status" "LabJobStatus" NOT NULL DEFAULT 'DRAFT',
    "priority" "LabPriority" NOT NULL DEFAULT 'NORMAL',
    "requested_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "due_date" DATE,
    "notes" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "lab_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "samples" (
    "id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "code" TEXT,
    "sampling_point_id" UUID,
    "sampling_stop_id" UUID,
    "matrix" "Matrix" NOT NULL,
    "description" TEXT,
    "client_sample_ref" TEXT,
    "sampled_at" TIMESTAMPTZ(3),
    "sampled_by_id" UUID,
    "sampled_by_name" TEXT,
    "received_at" TIMESTAMPTZ(3),
    "received_by_id" UUID,
    "receipt_temperature_c" DECIMAL(5,2),
    "receipt_condition" "ReceiptCondition",
    "receipt_notes" TEXT,
    "container_count" INTEGER,
    "storage_location" TEXT,
    "status" "SampleStatus" NOT NULL DEFAULT 'REGISTERED',
    "standard_id" UUID,
    "baseline_values" JSONB,
    "disposed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "samples_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sample_containers" (
    "id" UUID NOT NULL,
    "sample_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "container_type" TEXT,
    "volume_ml" INTEGER,
    "preservation" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sample_containers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sample_tests" (
    "id" UUID NOT NULL,
    "sample_id" UUID NOT NULL,
    "method_id" UUID NOT NULL,
    "parameter_id" UUID NOT NULL,
    "status" "SampleTestStatus" NOT NULL DEFAULT 'PENDING',
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "analyst_id" UUID,
    "batch_id" UUID,
    "instrument_id" UUID,
    "started_at" TIMESTAMPTZ(3),
    "analyzed_at" TIMESTAMPTZ(3),
    "raw_data" JSONB,
    "calc_formula_id" UUID,
    "dilution_factor" DECIMAL(14,6),
    "result_value" DECIMAL(24,10),
    "qualifier" "ResultQualifier" NOT NULL DEFAULT 'NONE',
    "result_text" TEXT,
    "unit" TEXT NOT NULL,
    "holding_deadline" TIMESTAMPTZ(3),
    "holding_time_exceeded" BOOLEAN NOT NULL DEFAULT false,
    "compliance_status" "ComplianceStatus",
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMPTZ(3),
    "approved_by_id" UUID,
    "approved_at" TIMESTAMPTZ(3),
    "rejection_reason" TEXT,
    "cancel_reason" TEXT,
    "remark" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "sample_tests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "result_audits" (
    "id" BIGSERIAL NOT NULL,
    "sample_test_id" UUID NOT NULL,
    "changed_by_id" UUID NOT NULL,
    "changed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "field" TEXT NOT NULL,
    "old_value" TEXT,
    "new_value" TEXT,
    "reason" TEXT,

    CONSTRAINT "result_audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analysis_batches" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "method_id" UUID NOT NULL,
    "analyst_id" UUID NOT NULL,
    "instrument_id" UUID,
    "status" "BatchStatus" NOT NULL DEFAULT 'OPEN',
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(3),
    "approved_by_id" UUID,
    "approved_at" TIMESTAMPTZ(3),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "analysis_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qc_results" (
    "id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "qc_type" "QcType" NOT NULL,
    "sample_test_id" UUID,
    "expected_value" DECIMAL(24,10),
    "measured_value" DECIMAL(24,10),
    "duplicate_value" DECIMAL(24,10),
    "spike_added_value" DECIMAL(24,10),
    "recovery_pct" DECIMAL(8,2),
    "rpd_pct" DECIMAL(8,2),
    "passed" BOOLEAN,
    "notes" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "qc_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "instruments" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT,
    "manufacturer" TEXT,
    "model" TEXT,
    "serial_no" TEXT,
    "location" TEXT,
    "status" "InstrumentStatus" NOT NULL DEFAULT 'IN_SERVICE',
    "calibration_interval_days" INTEGER,
    "last_calibrated_at" DATE,
    "next_calibration_due" DATE,
    "block_when_overdue" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "instruments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "instrument_events" (
    "id" UUID NOT NULL,
    "instrument_id" UUID NOT NULL,
    "type" "InstrumentEventType" NOT NULL,
    "performed_at" DATE NOT NULL,
    "performed_by_id" UUID,
    "performed_by_name" TEXT,
    "result" "EventResult",
    "certificate_no" TEXT,
    "certificate_file_id" UUID,
    "next_due_date" DATE,
    "notes" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "instrument_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_reports" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "report_version" INTEGER NOT NULL DEFAULT 1,
    "job_id" UUID NOT NULL,
    "status" "TestReportStatus" NOT NULL DEFAULT 'DRAFT',
    "amends_report_id" UUID,
    "amendment_reason" TEXT,
    "standard_id" UUID,
    "prepared_by_id" UUID NOT NULL,
    "authorized_by_id" UUID,
    "issued_at" TIMESTAMPTZ(3),
    "pdf_file_id" UUID,
    "sent_at" TIMESTAMPTZ(3),
    "sent_to" TEXT[],
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "test_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_report_samples" (
    "report_id" UUID NOT NULL,
    "sample_id" UUID NOT NULL,

    CONSTRAINT "test_report_samples_pkey" PRIMARY KEY ("report_id","sample_id")
);

-- CreateTable
CREATE TABLE "custody_transfers" (
    "id" UUID NOT NULL,
    "relinquished_by_user_id" UUID,
    "relinquished_by_name" TEXT,
    "received_by_id" UUID NOT NULL,
    "transferred_at" TIMESTAMPTZ(3) NOT NULL,
    "relinquish_signature_file_id" UUID,
    "receive_signature_file_id" UUID,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "custody_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custody_transfer_samples" (
    "transfer_id" UUID NOT NULL,
    "sample_id" UUID NOT NULL,

    CONSTRAINT "custody_transfer_samples_pkey" PRIMARY KEY ("transfer_id","sample_id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_en" TEXT,
    "description" TEXT,
    "client_id" UUID NOT NULL,
    "site_id" UUID,
    "type" "ProjectType" NOT NULL,
    "status" "ProjectStatus" NOT NULL DEFAULT 'PLANNING',
    "contract_no" TEXT,
    "contract_value" DECIMAL(14,2),
    "currency" TEXT NOT NULL DEFAULT 'THB',
    "planned_start_date" DATE,
    "planned_end_date" DATE,
    "actual_start_date" DATE,
    "actual_end_date" DATE,
    "project_manager_id" UUID,
    "revision_scheme" "RevisionScheme" NOT NULL DEFAULT 'ALPHA_NUMERIC',
    "require_separation_of_duties" BOOLEAN NOT NULL DEFAULT true,
    "closed_at" TIMESTAMPTZ(3),
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_members" (
    "project_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "ProjectRole" NOT NULL,
    "added_by_id" UUID,
    "added_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removed_at" TIMESTAMPTZ(3),

    CONSTRAINT "project_members_pkey" PRIMARY KEY ("project_id","user_id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "parent_id" UUID,
    "wbs_code" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "TaskType" NOT NULL DEFAULT 'TASK',
    "status" "TaskStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "planned_start" DATE,
    "planned_end" DATE,
    "actual_start" DATE,
    "actual_end" DATE,
    "progress_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "weight" DECIMAL(9,4) NOT NULL DEFAULT 1,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_assignees" (
    "task_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,

    CONSTRAINT "task_assignees_pkey" PRIMARY KEY ("task_id","user_id")
);

-- CreateTable
CREATE TABLE "task_dependencies" (
    "predecessor_id" UUID NOT NULL,
    "successor_id" UUID NOT NULL,
    "type" "DependencyType" NOT NULL DEFAULT 'FS',
    "lag_days" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "task_dependencies_pkey" PRIMARY KEY ("predecessor_id","successor_id")
);

-- CreateTable
CREATE TABLE "payment_milestones" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "percent" DECIMAL(5,2),
    "amount" DECIMAL(14,2) NOT NULL,
    "due_date" DATE,
    "deliverable_note" TEXT,
    "status" "PaymentMilestoneStatus" NOT NULL DEFAULT 'PENDING',
    "submitted_at" DATE,
    "accepted_at" DATE,
    "invoiced_at" DATE,
    "paid_at" DATE,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "payment_milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sampling_trips" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "planned_date" DATE NOT NULL,
    "status" "SamplingTripStatus" NOT NULL DEFAULT 'PLANNED',
    "leader_id" UUID NOT NULL,
    "vehicle" TEXT,
    "notes" TEXT,
    "started_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "sampling_trips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sampling_trip_members" (
    "trip_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,

    CONSTRAINT "sampling_trip_members_pkey" PRIMARY KEY ("trip_id","user_id")
);

-- CreateTable
CREATE TABLE "sampling_stops" (
    "id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "site_id" UUID NOT NULL,
    "sampling_point_id" UUID NOT NULL,
    "lab_job_id" UUID,
    "package_id" UUID,
    "method_ids" UUID[],
    "status" "SamplingStopStatus" NOT NULL DEFAULT 'PENDING',
    "arrived_at" TIMESTAMPTZ(3),
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "weather" TEXT,
    "observations" TEXT,
    "skipped_reason" TEXT,
    "client_rep_name" TEXT,
    "client_rep_signature_file_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "sampling_stops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_measurements" (
    "id" UUID NOT NULL,
    "stop_id" UUID NOT NULL,
    "sample_id" UUID,
    "parameter_id" UUID NOT NULL,
    "value" DECIMAL(24,10) NOT NULL,
    "unit" TEXT NOT NULL,
    "instrument_id" UUID,
    "measured_at" TIMESTAMPTZ(3) NOT NULL,
    "measured_by_id" UUID NOT NULL,
    "notes" TEXT,

    CONSTRAINT "field_measurements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_reports" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "report_date" DATE NOT NULL,
    "status" "DailyReportStatus" NOT NULL DEFAULT 'DRAFT',
    "weather_morning" "Weather",
    "weather_afternoon" "Weather",
    "work_start" TEXT,
    "work_end" TEXT,
    "summary" TEXT,
    "safety_notes" TEXT,
    "delay_notes" TEXT,
    "submitted_by_id" UUID,
    "submitted_at" TIMESTAMPTZ(3),
    "approved_by_id" UUID,
    "approved_at" TIMESTAMPTZ(3),
    "return_reason" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "daily_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_report_manpower" (
    "id" UUID NOT NULL,
    "report_id" UUID NOT NULL,
    "trade" TEXT NOT NULL,
    "company" TEXT,
    "headcount" INTEGER NOT NULL,
    "hours" DECIMAL(6,2),

    CONSTRAINT "daily_report_manpower_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_report_equipment" (
    "id" UUID NOT NULL,
    "report_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "hours" DECIMAL(6,2),

    CONSTRAINT "daily_report_equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_report_activities" (
    "id" UUID NOT NULL,
    "report_id" UUID NOT NULL,
    "task_id" UUID,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(14,4),
    "unit" TEXT,
    "progress_percent" DECIMAL(5,2),

    CONSTRAINT "daily_report_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issues" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "number" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" "IssueCategory" NOT NULL,
    "severity" "IssueSeverity" NOT NULL DEFAULT 'MEDIUM',
    "status" "IssueStatus" NOT NULL DEFAULT 'OPEN',
    "location_text" TEXT,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "document_revision_id" UUID,
    "drawing_anchor" JSONB,
    "assignee_id" UUID,
    "due_date" DATE,
    "raised_by_id" UUID NOT NULL,
    "raised_at" TIMESTAMPTZ(3) NOT NULL,
    "resolved_at" TIMESTAMPTZ(3),
    "resolution_note" TEXT,
    "verified_by_id" UUID,
    "verified_at" TIMESTAMPTZ(3),
    "closed_at" TIMESTAMPTZ(3),
    "cancel_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspection_templates" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "inspection_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspection_template_items" (
    "id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "section" TEXT,
    "question" TEXT NOT NULL,
    "response_type" "ChecklistResponseType" NOT NULL,
    "is_required" BOOLEAN NOT NULL DEFAULT true,
    "acceptance_criteria" TEXT,
    "unit" TEXT,

    CONSTRAINT "inspection_template_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspections" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "number" TEXT,
    "title" TEXT NOT NULL,
    "location_text" TEXT,
    "status" "InspectionStatus" NOT NULL DEFAULT 'DRAFT',
    "outcome" "InspectionOutcome",
    "inspected_by_id" UUID NOT NULL,
    "inspected_at" TIMESTAMPTZ(3) NOT NULL,
    "approved_by_id" UUID,
    "approved_at" TIMESTAMPTZ(3),
    "remarks" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "inspections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspection_results" (
    "id" UUID NOT NULL,
    "inspection_id" UUID NOT NULL,
    "template_item_id" UUID NOT NULL,
    "pass_fail" "PassFail",
    "number_value" DECIMAL(18,6),
    "text_value" TEXT,
    "note" TEXT,

    CONSTRAINT "inspection_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_queries" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "number" TEXT,
    "subject" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "status" "SiteQueryStatus" NOT NULL DEFAULT 'OPEN',
    "raised_by_id" UUID NOT NULL,
    "raised_at" TIMESTAMPTZ(3) NOT NULL,
    "assigned_to_id" UUID,
    "required_by" DATE,
    "answer" TEXT,
    "answered_by_id" UUID,
    "answered_at" TIMESTAMPTZ(3),
    "related_document_id" UUID,
    "requires_revision" BOOLEAN NOT NULL DEFAULT false,
    "closed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "site_queries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "quotations_supersedes_id_key" ON "quotations"("supersedes_id");

-- CreateIndex
CREATE INDEX "quotations_client_id_status_idx" ON "quotations"("client_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "quotations_number_rev_no_key" ON "quotations"("number", "rev_no");

-- CreateIndex
CREATE UNIQUE INDEX "quotation_items_quotation_id_seq_key" ON "quotation_items"("quotation_id", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "billing_records_number_key" ON "billing_records"("number");

-- CreateIndex
CREATE INDEX "billing_records_client_id_status_idx" ON "billing_records"("client_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "timesheets_user_id_week_start_key" ON "timesheets"("user_id", "week_start");

-- CreateIndex
CREATE INDEX "timesheet_entries_timesheet_id_idx" ON "timesheet_entries"("timesheet_id");

-- CreateIndex
CREATE INDEX "timesheet_entries_project_id_work_date_idx" ON "timesheet_entries"("project_id", "work_date");

-- CreateIndex
CREATE INDEX "cost_rates_user_id_effective_from_idx" ON "cost_rates"("user_id", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "departments_code_key" ON "departments"("code");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_employee_code_key" ON "users"("employee_code");

-- CreateIndex
CREATE INDEX "users_department_id_idx" ON "users"("department_id");

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");

-- CreateIndex
CREATE INDEX "user_roles_role_id_idx" ON "user_roles"("role_id");

-- CreateIndex
CREATE INDEX "professional_licenses_user_id_idx" ON "professional_licenses"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "professional_licenses_type_license_no_key" ON "professional_licenses"("type", "license_no");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_refresh_token_hash_key" ON "sessions"("refresh_token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_family_id_idx" ON "sessions"("family_id");

-- CreateIndex
CREATE UNIQUE INDEX "push_devices_fcm_token_key" ON "push_devices"("fcm_token");

-- CreateIndex
CREATE INDEX "push_devices_user_id_idx" ON "push_devices"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "numbering_schemes_entity_scope_key" ON "numbering_schemes"("entity", "scope");

-- CreateIndex
CREATE INDEX "idempotency_records_expires_at_idx" ON "idempotency_records"("expires_at");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_occurred_at_idx" ON "audit_logs"("actor_id", "occurred_at");

-- CreateIndex
CREATE INDEX "audit_logs_project_id_occurred_at_idx" ON "audit_logs"("project_id", "occurred_at");

-- CreateIndex
CREATE INDEX "audit_logs_occurred_at_idx" ON "audit_logs"("occurred_at");

-- CreateIndex
CREATE INDEX "outbox_events_processed_at_available_at_idx" ON "outbox_events"("processed_at", "available_at");

-- CreateIndex
CREATE INDEX "change_logs_scope_key_seq_idx" ON "change_logs"("scope_key", "seq");

-- CreateIndex
CREATE INDEX "change_logs_changed_at_idx" ON "change_logs"("changed_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_idx" ON "notifications"("user_id", "read_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "file_objects_storage_key_key" ON "file_objects"("storage_key");

-- CreateIndex
CREATE INDEX "file_objects_sha256_idx" ON "file_objects"("sha256");

-- CreateIndex
CREATE INDEX "file_objects_uploaded_by_id_created_at_idx" ON "file_objects"("uploaded_by_id", "created_at");

-- CreateIndex
CREATE INDEX "attachments_owner_type_owner_id_idx" ON "attachments"("owner_type", "owner_id");

-- CreateIndex
CREATE INDEX "comments_owner_type_owner_id_idx" ON "comments"("owner_type", "owner_id");

-- CreateIndex
CREATE INDEX "comments_review_step_id_idx" ON "comments"("review_step_id");

-- CreateIndex
CREATE INDEX "signature_events_entity_type_entity_id_idx" ON "signature_events"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "signature_events_user_id_signed_at_idx" ON "signature_events"("user_id", "signed_at");

-- CreateIndex
CREATE UNIQUE INDEX "clients_code_key" ON "clients"("code");

-- CreateIndex
CREATE INDEX "clients_name_th_trgm_idx" ON "clients" USING GIN ("name_th" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "clients_tax_id_idx" ON "clients"("tax_id");

-- CreateIndex
CREATE INDEX "client_contacts_client_id_idx" ON "client_contacts"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "sites_client_id_code_key" ON "sites"("client_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "sampling_points_site_id_code_key" ON "sampling_points"("site_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "disciplines_code_key" ON "disciplines"("code");

-- CreateIndex
CREATE UNIQUE INDEX "document_types_code_key" ON "document_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_templates_code_key" ON "workflow_templates"("code");

-- CreateIndex
CREATE INDEX "workflow_template_steps_template_id_step_order_idx" ON "workflow_template_steps"("template_id", "step_order");

-- CreateIndex
CREATE UNIQUE INDEX "documents_number_key" ON "documents"("number");

-- CreateIndex
CREATE UNIQUE INDEX "documents_current_revision_id_key" ON "documents"("current_revision_id");

-- CreateIndex
CREATE UNIQUE INDEX "documents_latest_approved_revision_id_key" ON "documents"("latest_approved_revision_id");

-- CreateIndex
CREATE INDEX "documents_project_id_discipline_id_document_type_id_idx" ON "documents"("project_id", "discipline_id", "document_type_id");

-- CreateIndex
CREATE INDEX "documents_project_id_status_idx" ON "documents"("project_id", "status");

-- CreateIndex
CREATE INDEX "documents_owner_id_idx" ON "documents"("owner_id");

-- CreateIndex
CREATE INDEX "documents_title_trgm_idx" ON "documents" USING GIN ("title" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "documents_number_trgm_idx" ON "documents" USING GIN ("number" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "document_plans_document_id_purpose_code_key" ON "document_plans"("document_id", "purpose_code");

-- CreateIndex
CREATE INDEX "document_revisions_status_idx" ON "document_revisions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "document_revisions_document_id_rev_label_key" ON "document_revisions"("document_id", "rev_label");

-- CreateIndex
CREATE UNIQUE INDEX "document_revisions_document_id_rev_index_key" ON "document_revisions"("document_id", "rev_index");

-- CreateIndex
CREATE INDEX "document_files_revision_id_role_is_current_idx" ON "document_files"("revision_id", "role", "is_current");

-- CreateIndex
CREATE INDEX "review_cycles_status_idx" ON "review_cycles"("status");

-- CreateIndex
CREATE UNIQUE INDEX "review_cycles_revision_id_cycle_no_key" ON "review_cycles"("revision_id", "cycle_no");

-- CreateIndex
CREATE INDEX "review_steps_cycle_id_step_order_idx" ON "review_steps"("cycle_id", "step_order");

-- CreateIndex
CREATE INDEX "review_steps_assignee_id_status_idx" ON "review_steps"("assignee_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "transmittals_number_key" ON "transmittals"("number");

-- CreateIndex
CREATE UNIQUE INDEX "transmittals_public_token_hash_key" ON "transmittals"("public_token_hash");

-- CreateIndex
CREATE INDEX "transmittals_project_id_status_idx" ON "transmittals"("project_id", "status");

-- CreateIndex
CREATE INDEX "transmittal_items_revision_id_idx" ON "transmittal_items"("revision_id");

-- CreateIndex
CREATE UNIQUE INDEX "transmittal_items_transmittal_id_revision_id_key" ON "transmittal_items"("transmittal_id", "revision_id");

-- CreateIndex
CREATE INDEX "transmittal_downloads_transmittal_id_idx" ON "transmittal_downloads"("transmittal_id");

-- CreateIndex
CREATE UNIQUE INDEX "design_bases_project_id_rev_no_key" ON "design_bases"("project_id", "rev_no");

-- CreateIndex
CREATE INDEX "design_basis_items_design_basis_id_idx" ON "design_basis_items"("design_basis_id");

-- CreateIndex
CREATE UNIQUE INDEX "parameters_code_key" ON "parameters"("code");

-- CreateIndex
CREATE UNIQUE INDEX "calc_formulas_code_version_key" ON "calc_formulas"("code", "version");

-- CreateIndex
CREATE UNIQUE INDEX "analytical_methods_parameter_id_code_key" ON "analytical_methods"("parameter_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "qc_criteria_method_id_qc_type_key" ON "qc_criteria"("method_id", "qc_type");

-- CreateIndex
CREATE UNIQUE INDEX "test_packages_code_key" ON "test_packages"("code");

-- CreateIndex
CREATE UNIQUE INDEX "regulatory_standards_code_key" ON "regulatory_standards"("code");

-- CreateIndex
CREATE UNIQUE INDEX "standard_limits_standard_id_parameter_id_key" ON "standard_limits"("standard_id", "parameter_id");

-- CreateIndex
CREATE UNIQUE INDEX "lab_jobs_number_key" ON "lab_jobs"("number");

-- CreateIndex
CREATE INDEX "lab_jobs_client_id_status_idx" ON "lab_jobs"("client_id", "status");

-- CreateIndex
CREATE INDEX "lab_jobs_status_due_date_idx" ON "lab_jobs"("status", "due_date");

-- CreateIndex
CREATE UNIQUE INDEX "samples_code_key" ON "samples"("code");

-- CreateIndex
CREATE INDEX "samples_job_id_idx" ON "samples"("job_id");

-- CreateIndex
CREATE INDEX "samples_status_idx" ON "samples"("status");

-- CreateIndex
CREATE UNIQUE INDEX "sample_containers_label_key" ON "sample_containers"("label");

-- CreateIndex
CREATE INDEX "sample_tests_status_analyst_id_idx" ON "sample_tests"("status", "analyst_id");

-- CreateIndex
CREATE INDEX "sample_tests_batch_id_idx" ON "sample_tests"("batch_id");

-- CreateIndex
CREATE UNIQUE INDEX "sample_tests_sample_id_method_id_key" ON "sample_tests"("sample_id", "method_id");

-- CreateIndex
CREATE INDEX "result_audits_sample_test_id_idx" ON "result_audits"("sample_test_id");

-- CreateIndex
CREATE UNIQUE INDEX "analysis_batches_number_key" ON "analysis_batches"("number");

-- CreateIndex
CREATE INDEX "analysis_batches_method_id_status_idx" ON "analysis_batches"("method_id", "status");

-- CreateIndex
CREATE INDEX "qc_results_batch_id_idx" ON "qc_results"("batch_id");

-- CreateIndex
CREATE UNIQUE INDEX "instruments_code_key" ON "instruments"("code");

-- CreateIndex
CREATE INDEX "instrument_events_instrument_id_performed_at_idx" ON "instrument_events"("instrument_id", "performed_at");

-- CreateIndex
CREATE UNIQUE INDEX "test_reports_amends_report_id_key" ON "test_reports"("amends_report_id");

-- CreateIndex
CREATE INDEX "test_reports_job_id_idx" ON "test_reports"("job_id");

-- CreateIndex
CREATE UNIQUE INDEX "test_reports_number_report_version_key" ON "test_reports"("number", "report_version");

-- CreateIndex
CREATE UNIQUE INDEX "projects_code_key" ON "projects"("code");

-- CreateIndex
CREATE INDEX "projects_client_id_idx" ON "projects"("client_id");

-- CreateIndex
CREATE INDEX "projects_status_idx" ON "projects"("status");

-- CreateIndex
CREATE INDEX "projects_name_trgm_idx" ON "projects" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "project_members_user_id_idx" ON "project_members"("user_id");

-- CreateIndex
CREATE INDEX "tasks_project_id_parent_id_idx" ON "tasks"("project_id", "parent_id");

-- CreateIndex
CREATE INDEX "task_assignees_user_id_idx" ON "task_assignees"("user_id");

-- CreateIndex
CREATE INDEX "task_dependencies_successor_id_idx" ON "task_dependencies"("successor_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_milestones_project_id_seq_key" ON "payment_milestones"("project_id", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "sampling_trips_number_key" ON "sampling_trips"("number");

-- CreateIndex
CREATE INDEX "sampling_trips_planned_date_status_idx" ON "sampling_trips"("planned_date", "status");

-- CreateIndex
CREATE INDEX "sampling_trip_members_user_id_idx" ON "sampling_trip_members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "sampling_stops_trip_id_seq_key" ON "sampling_stops"("trip_id", "seq");

-- CreateIndex
CREATE INDEX "field_measurements_stop_id_idx" ON "field_measurements"("stop_id");

-- CreateIndex
CREATE INDEX "daily_reports_project_id_status_idx" ON "daily_reports"("project_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "daily_reports_project_id_report_date_created_by_id_key" ON "daily_reports"("project_id", "report_date", "created_by_id");

-- CreateIndex
CREATE INDEX "daily_report_manpower_report_id_idx" ON "daily_report_manpower"("report_id");

-- CreateIndex
CREATE INDEX "daily_report_equipment_report_id_idx" ON "daily_report_equipment"("report_id");

-- CreateIndex
CREATE INDEX "daily_report_activities_report_id_idx" ON "daily_report_activities"("report_id");

-- CreateIndex
CREATE UNIQUE INDEX "issues_number_key" ON "issues"("number");

-- CreateIndex
CREATE INDEX "issues_project_id_status_idx" ON "issues"("project_id", "status");

-- CreateIndex
CREATE INDEX "issues_assignee_id_status_idx" ON "issues"("assignee_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "inspection_templates_code_key" ON "inspection_templates"("code");

-- CreateIndex
CREATE UNIQUE INDEX "inspection_template_items_template_id_seq_key" ON "inspection_template_items"("template_id", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "inspections_number_key" ON "inspections"("number");

-- CreateIndex
CREATE INDEX "inspections_project_id_status_idx" ON "inspections"("project_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "inspection_results_inspection_id_template_item_id_key" ON "inspection_results"("inspection_id", "template_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "site_queries_number_key" ON "site_queries"("number");

-- CreateIndex
CREATE INDEX "site_queries_project_id_status_idx" ON "site_queries"("project_id", "status");

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "client_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_prepared_by_id_fkey" FOREIGN KEY ("prepared_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_supersedes_id_fkey" FOREIGN KEY ("supersedes_id") REFERENCES "quotations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "quotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_method_id_fkey" FOREIGN KEY ("method_id") REFERENCES "analytical_methods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "test_packages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_records" ADD CONSTRAINT "billing_records_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_records" ADD CONSTRAINT "billing_records_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_records" ADD CONSTRAINT "billing_records_lab_job_id_fkey" FOREIGN KEY ("lab_job_id") REFERENCES "lab_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_records" ADD CONSTRAINT "billing_records_payment_milestone_id_fkey" FOREIGN KEY ("payment_milestone_id") REFERENCES "payment_milestones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_records" ADD CONSTRAINT "billing_records_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "quotations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheets" ADD CONSTRAINT "timesheets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheets" ADD CONSTRAINT "timesheets_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheet_entries" ADD CONSTRAINT "timesheet_entries_timesheet_id_fkey" FOREIGN KEY ("timesheet_id") REFERENCES "timesheets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheet_entries" ADD CONSTRAINT "timesheet_entries_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheet_entries" ADD CONSTRAINT "timesheet_entries_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_rates" ADD CONSTRAINT "cost_rates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "professional_licenses" ADD CONSTRAINT "professional_licenses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_devices" ADD CONSTRAINT "push_devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_objects" ADD CONSTRAINT "file_objects_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "file_objects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "comments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_review_step_id_fkey" FOREIGN KEY ("review_step_id") REFERENCES "review_steps"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_carried_from_comment_id_fkey" FOREIGN KEY ("carried_from_comment_id") REFERENCES "comments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signature_events" ADD CONSTRAINT "signature_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signature_events" ADD CONSTRAINT "signature_events_license_id_fkey" FOREIGN KEY ("license_id") REFERENCES "professional_licenses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_contacts" ADD CONSTRAINT "client_contacts_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sites" ADD CONSTRAINT "sites_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sites" ADD CONSTRAINT "sites_default_standard_id_fkey" FOREIGN KEY ("default_standard_id") REFERENCES "regulatory_standards"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sampling_points" ADD CONSTRAINT "sampling_points_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sampling_points" ADD CONSTRAINT "sampling_points_default_standard_id_fkey" FOREIGN KEY ("default_standard_id") REFERENCES "regulatory_standards"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_types" ADD CONSTRAINT "document_types_default_workflow_template_id_fkey" FOREIGN KEY ("default_workflow_template_id") REFERENCES "workflow_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_template_steps" ADD CONSTRAINT "workflow_template_steps_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "workflow_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_discipline_id_fkey" FOREIGN KEY ("discipline_id") REFERENCES "disciplines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_document_type_id_fkey" FOREIGN KEY ("document_type_id") REFERENCES "document_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_workflow_template_id_fkey" FOREIGN KEY ("workflow_template_id") REFERENCES "workflow_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_current_revision_id_fkey" FOREIGN KEY ("current_revision_id") REFERENCES "document_revisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_latest_approved_revision_id_fkey" FOREIGN KEY ("latest_approved_revision_id") REFERENCES "document_revisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_superseded_by_document_id_fkey" FOREIGN KEY ("superseded_by_document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_plans" ADD CONSTRAINT "document_plans_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_revisions" ADD CONSTRAINT "document_revisions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_revisions" ADD CONSTRAINT "document_revisions_prepared_by_id_fkey" FOREIGN KEY ("prepared_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_revisions" ADD CONSTRAINT "document_revisions_checked_by_id_fkey" FOREIGN KEY ("checked_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_revisions" ADD CONSTRAINT "document_revisions_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_files" ADD CONSTRAINT "document_files_revision_id_fkey" FOREIGN KEY ("revision_id") REFERENCES "document_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_files" ADD CONSTRAINT "document_files_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "file_objects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_files" ADD CONSTRAINT "document_files_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_cycles" ADD CONSTRAINT "review_cycles_revision_id_fkey" FOREIGN KEY ("revision_id") REFERENCES "document_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_cycles" ADD CONSTRAINT "review_cycles_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "workflow_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_cycles" ADD CONSTRAINT "review_cycles_submitted_by_id_fkey" FOREIGN KEY ("submitted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_steps" ADD CONSTRAINT "review_steps_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "review_cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_steps" ADD CONSTRAINT "review_steps_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_steps" ADD CONSTRAINT "review_steps_signature_event_id_fkey" FOREIGN KEY ("signature_event_id") REFERENCES "signature_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transmittals" ADD CONSTRAINT "transmittals_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transmittals" ADD CONSTRAINT "transmittals_recipient_client_id_fkey" FOREIGN KEY ("recipient_client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transmittals" ADD CONSTRAINT "transmittals_sent_by_id_fkey" FOREIGN KEY ("sent_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transmittal_items" ADD CONSTRAINT "transmittal_items_transmittal_id_fkey" FOREIGN KEY ("transmittal_id") REFERENCES "transmittals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transmittal_items" ADD CONSTRAINT "transmittal_items_revision_id_fkey" FOREIGN KEY ("revision_id") REFERENCES "document_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transmittal_downloads" ADD CONSTRAINT "transmittal_downloads_transmittal_id_fkey" FOREIGN KEY ("transmittal_id") REFERENCES "transmittals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "design_bases" ADD CONSTRAINT "design_bases_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "design_bases" ADD CONSTRAINT "design_bases_target_standard_id_fkey" FOREIGN KEY ("target_standard_id") REFERENCES "regulatory_standards"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "design_bases" ADD CONSTRAINT "design_bases_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "design_basis_items" ADD CONSTRAINT "design_basis_items_design_basis_id_fkey" FOREIGN KEY ("design_basis_id") REFERENCES "design_bases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "design_basis_items" ADD CONSTRAINT "design_basis_items_parameter_id_fkey" FOREIGN KEY ("parameter_id") REFERENCES "parameters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytical_methods" ADD CONSTRAINT "analytical_methods_parameter_id_fkey" FOREIGN KEY ("parameter_id") REFERENCES "parameters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytical_methods" ADD CONSTRAINT "analytical_methods_calc_formula_id_fkey" FOREIGN KEY ("calc_formula_id") REFERENCES "calc_formulas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qc_criteria" ADD CONSTRAINT "qc_criteria_method_id_fkey" FOREIGN KEY ("method_id") REFERENCES "analytical_methods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_package_items" ADD CONSTRAINT "test_package_items_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "test_packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_package_items" ADD CONSTRAINT "test_package_items_method_id_fkey" FOREIGN KEY ("method_id") REFERENCES "analytical_methods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regulatory_standards" ADD CONSTRAINT "regulatory_standards_base_standard_id_fkey" FOREIGN KEY ("base_standard_id") REFERENCES "regulatory_standards"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "standard_limits" ADD CONSTRAINT "standard_limits_standard_id_fkey" FOREIGN KEY ("standard_id") REFERENCES "regulatory_standards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "standard_limits" ADD CONSTRAINT "standard_limits_parameter_id_fkey" FOREIGN KEY ("parameter_id") REFERENCES "parameters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_jobs" ADD CONSTRAINT "lab_jobs_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_jobs" ADD CONSTRAINT "lab_jobs_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_jobs" ADD CONSTRAINT "lab_jobs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_jobs" ADD CONSTRAINT "lab_jobs_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "client_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_jobs" ADD CONSTRAINT "lab_jobs_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "quotations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_jobs" ADD CONSTRAINT "lab_jobs_standard_id_fkey" FOREIGN KEY ("standard_id") REFERENCES "regulatory_standards"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "samples" ADD CONSTRAINT "samples_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "lab_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "samples" ADD CONSTRAINT "samples_sampling_point_id_fkey" FOREIGN KEY ("sampling_point_id") REFERENCES "sampling_points"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "samples" ADD CONSTRAINT "samples_sampling_stop_id_fkey" FOREIGN KEY ("sampling_stop_id") REFERENCES "sampling_stops"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "samples" ADD CONSTRAINT "samples_sampled_by_id_fkey" FOREIGN KEY ("sampled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "samples" ADD CONSTRAINT "samples_received_by_id_fkey" FOREIGN KEY ("received_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "samples" ADD CONSTRAINT "samples_standard_id_fkey" FOREIGN KEY ("standard_id") REFERENCES "regulatory_standards"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sample_containers" ADD CONSTRAINT "sample_containers_sample_id_fkey" FOREIGN KEY ("sample_id") REFERENCES "samples"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sample_tests" ADD CONSTRAINT "sample_tests_sample_id_fkey" FOREIGN KEY ("sample_id") REFERENCES "samples"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sample_tests" ADD CONSTRAINT "sample_tests_method_id_fkey" FOREIGN KEY ("method_id") REFERENCES "analytical_methods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sample_tests" ADD CONSTRAINT "sample_tests_parameter_id_fkey" FOREIGN KEY ("parameter_id") REFERENCES "parameters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sample_tests" ADD CONSTRAINT "sample_tests_analyst_id_fkey" FOREIGN KEY ("analyst_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sample_tests" ADD CONSTRAINT "sample_tests_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "analysis_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sample_tests" ADD CONSTRAINT "sample_tests_instrument_id_fkey" FOREIGN KEY ("instrument_id") REFERENCES "instruments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sample_tests" ADD CONSTRAINT "sample_tests_calc_formula_id_fkey" FOREIGN KEY ("calc_formula_id") REFERENCES "calc_formulas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sample_tests" ADD CONSTRAINT "sample_tests_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sample_tests" ADD CONSTRAINT "sample_tests_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_audits" ADD CONSTRAINT "result_audits_sample_test_id_fkey" FOREIGN KEY ("sample_test_id") REFERENCES "sample_tests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_batches" ADD CONSTRAINT "analysis_batches_method_id_fkey" FOREIGN KEY ("method_id") REFERENCES "analytical_methods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_batches" ADD CONSTRAINT "analysis_batches_analyst_id_fkey" FOREIGN KEY ("analyst_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_batches" ADD CONSTRAINT "analysis_batches_instrument_id_fkey" FOREIGN KEY ("instrument_id") REFERENCES "instruments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qc_results" ADD CONSTRAINT "qc_results_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "analysis_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qc_results" ADD CONSTRAINT "qc_results_sample_test_id_fkey" FOREIGN KEY ("sample_test_id") REFERENCES "sample_tests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instrument_events" ADD CONSTRAINT "instrument_events_instrument_id_fkey" FOREIGN KEY ("instrument_id") REFERENCES "instruments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_reports" ADD CONSTRAINT "test_reports_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "lab_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_reports" ADD CONSTRAINT "test_reports_standard_id_fkey" FOREIGN KEY ("standard_id") REFERENCES "regulatory_standards"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_reports" ADD CONSTRAINT "test_reports_prepared_by_id_fkey" FOREIGN KEY ("prepared_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_reports" ADD CONSTRAINT "test_reports_authorized_by_id_fkey" FOREIGN KEY ("authorized_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_reports" ADD CONSTRAINT "test_reports_amends_report_id_fkey" FOREIGN KEY ("amends_report_id") REFERENCES "test_reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_report_samples" ADD CONSTRAINT "test_report_samples_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "test_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_report_samples" ADD CONSTRAINT "test_report_samples_sample_id_fkey" FOREIGN KEY ("sample_id") REFERENCES "samples"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custody_transfers" ADD CONSTRAINT "custody_transfers_received_by_id_fkey" FOREIGN KEY ("received_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custody_transfer_samples" ADD CONSTRAINT "custody_transfer_samples_transfer_id_fkey" FOREIGN KEY ("transfer_id") REFERENCES "custody_transfers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custody_transfer_samples" ADD CONSTRAINT "custody_transfer_samples_sample_id_fkey" FOREIGN KEY ("sample_id") REFERENCES "samples"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_project_manager_id_fkey" FOREIGN KEY ("project_manager_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_predecessor_id_fkey" FOREIGN KEY ("predecessor_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_successor_id_fkey" FOREIGN KEY ("successor_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_milestones" ADD CONSTRAINT "payment_milestones_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sampling_trips" ADD CONSTRAINT "sampling_trips_leader_id_fkey" FOREIGN KEY ("leader_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sampling_trip_members" ADD CONSTRAINT "sampling_trip_members_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "sampling_trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sampling_trip_members" ADD CONSTRAINT "sampling_trip_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sampling_stops" ADD CONSTRAINT "sampling_stops_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "sampling_trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sampling_stops" ADD CONSTRAINT "sampling_stops_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sampling_stops" ADD CONSTRAINT "sampling_stops_sampling_point_id_fkey" FOREIGN KEY ("sampling_point_id") REFERENCES "sampling_points"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sampling_stops" ADD CONSTRAINT "sampling_stops_lab_job_id_fkey" FOREIGN KEY ("lab_job_id") REFERENCES "lab_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sampling_stops" ADD CONSTRAINT "sampling_stops_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "test_packages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_measurements" ADD CONSTRAINT "field_measurements_stop_id_fkey" FOREIGN KEY ("stop_id") REFERENCES "sampling_stops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_measurements" ADD CONSTRAINT "field_measurements_sample_id_fkey" FOREIGN KEY ("sample_id") REFERENCES "samples"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_measurements" ADD CONSTRAINT "field_measurements_parameter_id_fkey" FOREIGN KEY ("parameter_id") REFERENCES "parameters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_measurements" ADD CONSTRAINT "field_measurements_instrument_id_fkey" FOREIGN KEY ("instrument_id") REFERENCES "instruments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_measurements" ADD CONSTRAINT "field_measurements_measured_by_id_fkey" FOREIGN KEY ("measured_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_reports" ADD CONSTRAINT "daily_reports_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_reports" ADD CONSTRAINT "daily_reports_submitted_by_id_fkey" FOREIGN KEY ("submitted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_reports" ADD CONSTRAINT "daily_reports_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_report_manpower" ADD CONSTRAINT "daily_report_manpower_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "daily_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_report_equipment" ADD CONSTRAINT "daily_report_equipment_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "daily_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_report_activities" ADD CONSTRAINT "daily_report_activities_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "daily_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_report_activities" ADD CONSTRAINT "daily_report_activities_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issues" ADD CONSTRAINT "issues_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issues" ADD CONSTRAINT "issues_document_revision_id_fkey" FOREIGN KEY ("document_revision_id") REFERENCES "document_revisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issues" ADD CONSTRAINT "issues_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issues" ADD CONSTRAINT "issues_raised_by_id_fkey" FOREIGN KEY ("raised_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_template_items" ADD CONSTRAINT "inspection_template_items_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "inspection_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "inspection_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_inspected_by_id_fkey" FOREIGN KEY ("inspected_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_results" ADD CONSTRAINT "inspection_results_inspection_id_fkey" FOREIGN KEY ("inspection_id") REFERENCES "inspections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_results" ADD CONSTRAINT "inspection_results_template_item_id_fkey" FOREIGN KEY ("template_item_id") REFERENCES "inspection_template_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_queries" ADD CONSTRAINT "site_queries_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_queries" ADD CONSTRAINT "site_queries_raised_by_id_fkey" FOREIGN KEY ("raised_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_queries" ADD CONSTRAINT "site_queries_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_queries" ADD CONSTRAINT "site_queries_related_document_id_fkey" FOREIGN KEY ("related_document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
