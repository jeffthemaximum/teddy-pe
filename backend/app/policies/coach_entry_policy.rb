class CoachEntryPolicy < ApplicationPolicy
  def index?  = user.coach?
  def show?   = user.coach? && record.user_id == user.id
  def create? = user.coach?
  def update? = show?

  # The same line as the athlete's: his own notes, nobody else's. Teddy never
  # reaches this, because the scope hands him nothing to authorize.
  def destroy? = user.coach? && record.user_id == user.id

  class Scope < Scope
    # Only the coach reads coach entries, and only their own, and only the
    # ones he has not deleted. One place, the same as AthleteEntryPolicy's.
    def resolve = user&.coach? ? scope.kept.where(user_id: user.id) : scope.none
  end
end
