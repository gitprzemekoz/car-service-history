import React, { useState } from "react";
import { Car, Hash, Mail, User, UserPlus } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";
import { CLIENT_FIELDS } from "@/lib/validation";

type Field = keyof typeof CLIENT_FIELDS;

interface Props {
  serverError?: string | null;
}

export default function AddClientForm({ serverError }: Props) {
  const [values, setValues] = useState<Record<Field, string>>({
    name: "",
    email: "",
    make: "",
    model: "",
    registrationNumber: "",
  });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});

  function validate() {
    const next: typeof errors = {};

    if (!values.name.trim()) next.name = "Name is required";

    if (!values.email.trim()) {
      next.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) {
      next.email = "Enter a valid email address";
    }

    if (!values.make.trim()) next.make = "Make is required";
    if (!values.model.trim()) next.model = "Model is required";
    if (!values.registrationNumber.trim()) next.registrationNumber = "Registration number is required";

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function update(field: Field, value: string) {
    setValues((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    if (!validate()) {
      e.preventDefault();
    }
  }

  return (
    <form method="POST" action="/api/clients" className="space-y-4" onSubmit={handleSubmit} noValidate>
      <FormField
        id={CLIENT_FIELDS.name}
        label="Name"
        value={values.name}
        onChange={(v) => {
          update("name", v);
        }}
        placeholder="Jan Kowalski"
        error={errors.name}
        icon={<User className="size-4" />}
      />

      <FormField
        id={CLIENT_FIELDS.email}
        type="email"
        label="Email"
        value={values.email}
        onChange={(v) => {
          update("email", v);
        }}
        placeholder="client@example.com"
        error={errors.email}
        icon={<Mail className="size-4" />}
      />

      <FormField
        id={CLIENT_FIELDS.make}
        label="Make"
        value={values.make}
        onChange={(v) => {
          update("make", v);
        }}
        placeholder="Toyota"
        error={errors.make}
        icon={<Car className="size-4" />}
      />

      <FormField
        id={CLIENT_FIELDS.model}
        label="Model"
        value={values.model}
        onChange={(v) => {
          update("model", v);
        }}
        placeholder="Corolla"
        error={errors.model}
        icon={<Car className="size-4" />}
      />

      <FormField
        id={CLIENT_FIELDS.registrationNumber}
        label="Registration number"
        value={values.registrationNumber}
        onChange={(v) => {
          update("registrationNumber", v);
        }}
        placeholder="WX 12345"
        error={errors.registrationNumber}
        icon={<Hash className="size-4" />}
      />

      <ServerError message={serverError} />

      <SubmitButton pendingText="Adding client..." icon={<UserPlus className="size-4" />}>
        Add client
      </SubmitButton>
    </form>
  );
}
