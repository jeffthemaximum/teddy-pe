class CoachEntryPolicy < ApplicationPolicy
  def index?  = user.coach?
  def show?   = user.coach? && record.user_id == user.id
  def create? = user.coach?
  def update? = show?

  class Scope < Scope
    # Only the coach reads coach entries, and only their own, and only the
    # ones he has not deleted. One place, the same as AthleteEntryPolicy's.
    def resolve = user&.coach? ? scope.kept.where(user_id: user.id) : scope.none
  end
end
